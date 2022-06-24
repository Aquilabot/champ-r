import os from 'os';
import { promises as fs, constants as fsConstants } from 'fs';
import * as path from 'path';
import cjk from 'cjk-regex';
import chokidar, { FSWatcher } from 'chokidar';
import WebSocket from 'ws';
import got, { Got } from 'got';

import {
  IChampionSelectActionItem,
  IChampionSelectRespData,
  IChampionSelectTeamItem,
  ILcuAuth,
  IPerkPage,
} from '@interfaces/commonTypes';
import { appConfig } from './config';
import { GamePhase, LcuEvent } from '../constants/events';
import { nanoid } from 'nanoid';

const cjk_charset = cjk();

export async function ifIsCNServer(dir: string) {
  if (!dir) {
    return false;
  }

  const target = path.join(dir, `TCLS`, `Client.exe`);
  let result = false;
  try {
    await fs.access(dir, fsConstants.F_OK);
    await fs.access(target, fsConstants.F_OK);
    result = true;
  } catch (_err) {
    console.info(`[lcu] maybe it's cn version`);
  }

  appConfig.set(`appendGameToDir`, result);
  const hasCjk = hasCJKChar(dir);
  appConfig.set(`lolDirHasCJKChar`, hasCjk);
  console.log('shouldAppendGameToDir: ', result, `lolDirHasCJKChar: `, hasCjk);
  return result;
}

export const hasCJKChar = (p: string) => {
  return cjk_charset.toRegExp().test(p);
};

export async function parseAuthInfo(p: string): Promise<ILcuAuth> {
  try {
    const lockfile = await fs.readFile(p, `utf8`);
    const port = lockfile.split(`:`)[2];
    const token = lockfile.split(`:`)[3];
    const url = `://riot:${token}@127.0.0.1:${port}`;
    const urlWithAuth = `https${url}`;

    return {
      port,
      token,
      urlWithAuth,
    };
  } catch (err) {
    return Promise.reject(err);
  }
}

interface IBusListener {
  event: LcuEvent;
  fn: Function;
  once: boolean;
}

export interface IEventBus {
  emit: (ev: string, data?: any) => void;
  listeners: IBusListener[];
}

const makeCmdOutFilePath = () => path.join(os.tmpdir(), `ChampR_${nanoid()}.tmp`);

let cmdOutFile = makeCmdOutFilePath();
const prepareCmdOutFile = async () => {
  try {
    await fs.access(cmdOutFile, fsConstants.R_OK | fsConstants.W_OK);
    await fs.stat(cmdOutFile);
  } catch (e) {
    cmdOutFile = makeCmdOutFilePath();
    await fs.writeFile(cmdOutFile, ``);
  }
};

export const getAuthFromPs = async (): Promise<ILcuAuth | null> => {
  try {
    await prepareCmdOutFile();
    await execCmd(
      `Start-Process powershell -WindowStyle hidden -Verb runAs -ArgumentList "-noprofile (Get-CimInstance Win32_Process -Filter \\""name = 'LeagueClientUx.exe'\\"").CommandLine | out-file -encoding utf8 -force ${cmdOutFile}"`,
      true,
    );
    const buffer = await fs.readFile(cmdOutFile);
    const stdout = buffer.toString();
    if (!stdout.trim().length) {
      return null;
    }

    const port = stdout.split('--app-port=')[1]?.split('"')[0] ?? ``;
    const token = stdout.split('--remoting-auth-token=')[1]?.split('"')[0] ?? ``;
    const urlWithAuth = `https://riot:${token}@127.0.0.1:${port}`;

    return {
      port,
      token,
      urlWithAuth,
    };
  } catch (err) {
    console.error(`[ps] `, err);
    return null;
  }
};

export const getAuthFromCmd = async (): Promise<ILcuAuth | null> => {
  try {
    const cmdLine = await execCmd(
      `wmic PROCESS WHERE name='LeagueClientUx.exe' GET commandline`,
      false,
    );
    const port = cmdLine.split('--app-port=')[1]?.split('"')[0] ?? ``;
    const token = cmdLine.split('--remoting-auth-token=')[1]?.split('"')[0] ?? ``;
    const urlWithAuth = `https://riot:${token}@127.0.0.1:${port}`;

    return {
      port,
      token,
      urlWithAuth,
    };
  } catch (err) {
    console.error(`[cmd] `, err);
    return null;
  }
};

export class LcuWatcher {
  public evBus: IEventBus | null = null;
  private request!: Got;
  private summonerId = 0;
  private lcuURL = ``;
  public wsURL = ``;
  private getAuthTask: NodeJS.Timeout | null = null;
  private checkLcuStatusTask: NodeJS.Timeout | null = null;
  private watchChampSelectTask: NodeJS.Timeout | null = null;
  private withPwsh = false;

  constructor(withPwsh: boolean) {
    this.withPwsh = withPwsh;

    this.initListener();
  }

  public startAuthTask = async () => {
    clearTimeout(this.getAuthTask!);

    this.getAuthTask = setTimeout(async () => {
      try {
        await this.getAuth();
      } catch (e) {
        console.error(`[watcher] [getAuthTask]`, e);
      } finally {
        this.startAuthTask();
      }
    }, 2000);
  };

  public initWatcher = (dir: string) => {
    console.log(`init lockfile watcher, dir: ${dir}`);
    this.lolDir = dir;

    this.checkLcuStatusTask = setInterval(async () => {
      try {
        await this.getSummonerId();
      } catch (err) {
        console.info(`[watcher] lcu is not active,`, err.message);
        // clearInterval(this.checkLcuStatusTask!);
        // this.startAuthTask();
      }
    }, 4000);
  };

  public getAuth = async () => {
    try {
      const cmdRet = this.withPwsh ? await getAuthFromPs() : await getAuthFromCmd();
      const { port: appPort, token: remotingAuthToken, urlWithAuth: lcuURL } = cmdRet ?? {};

      if (appPort && remotingAuthToken) {
        if (lcuURL !== this.lcuURL) {
          this.lcuURL = lcuURL ?? ``;
          console.info(this.lcuURL);
          this.wsURL = `riot:${remotingAuthToken}@127.0.0.1:${appPort}`;
          this.evBus?.emit(LcuEvent.OnAuthUpdate, this.wsURL);
        }

        clearTimeout(this.getAuthTask!);
        clearInterval(this.checkLcuStatusTask!);

        this.request = got.extend({
          prefixUrl: this.lcuURL,
        });

        // this.startCheckLcuStatusTask();
        // this.watchChampSelect();
      } else {
        console.warn(`[watcher] fetch lcu status failed`);
        // this.hidePopup();
      }
    } catch (err) {
      console.warn(`[watcher] [cmd] lcu is not active`, err.message);
    }
  };

  public changeDir = async (dir: string) => {
    if (this.lolDir === dir) {
      return;
    }

    this.watchChampSelectTask = setInterval(async () => {
      try {
        await this.getSummonerId();
        const ret: IChampionSelectRespData = await this.request
          .get(`lol-champ-select/v1/session`)
          .json();
        this.onSelectChampion(ret);
      } catch (_err) {
        // clearInterval(this.watchChampSelectTask!);
        // this.getAuth();
        // this.hidePopup();
      }
    }, 2000);
  };

  public getSummonerId = async () => {
    try {
      const ret: { summonerId: number } = await this.request
        .get(`lol-chat/v1/me`, {
          timeout: {
            request: 3500,
          },
        })
        .json();

      const summonerId = ret?.summonerId ?? 0;
      if (summonerId !== this.summonerId) {
        console.info(`[watcher] lcu status changed`);
        this.summonerId = summonerId;
      }
    } catch (err) {
      // console.log(err);
      return Promise.resolve();
    }
  };

  public findChampionIdFromMyTeam = (myTeam: IChampionSelectTeamItem[] = [], cellId: number) => {
    const me = myTeam.find((i) => i.cellId === cellId);
    return me?.championId ?? 0;
  };

  public findChampionIdFromActions = (actions: IChampionSelectActionItem[][], cellId: number) => {
    let championId = 0;
    for (const row of actions) {
      for (const i of row) {
        if (i.actorCellId === cellId && i.type !== `ban`) {
          championId = i.championId;
          break;
        }
      }
    }

    return championId;
  };

  public getChampionIdFromLcuData = (data: IChampionSelectRespData) => {
    const { myTeam = [], actions = [], localPlayerCellId } = data;
    let championId: number;
    championId = this.findChampionIdFromMyTeam(myTeam, localPlayerCellId);
    if (championId === 0) {
      championId = this.findChampionIdFromActions(actions, localPlayerCellId);
    }

    return championId;
  };

  public onSelectChampion = (data: IChampionSelectRespData) => {
    // console.log(data);
    const { myTeam = [], timer } = data;
    if (timer?.phase === GamePhase.GameStarting || this.summonerId <= 0 || myTeam.length === 0) {
      // match started or ended
      // this.hidePopup();
      return;
    }

    const championId = this.getChampionIdFromLcuData(data);
    if (championId > 0) {
      console.info(`[ws] picked champion ${championId}`);
      this.evBus!.emit(LcuEvent.SelectedChampion, {
        championId: championId,
      });
    }
  };

  public handleLcuMessage = (buffer: Buffer) => {
    try {
      const msg = JSON.parse(JSON.stringify(buffer.toString()));
      const [_evType, _evName, resp] = JSON.parse(msg);
      if (!resp) {
        return;
      }

      switch (resp.uri) {
        case `/lol-champ-select/v1/session`: {
          this.onSelectChampion(resp.data ?? {});
          return;
        }
        case `/lol-chat/v1/me`: {
          this.summonerId = resp?.data?.summonerId ?? 0;
          return;
        }
        default:
          return;
      }
    } catch (err) {
      console.info(`[ws] handle lcu message improperly: `, err.message);
    }
  };

  public onLcuClose = () => {
    if (!this.ws) {
      return;
    }

    this.ws.terminate();
    console.log(`[watcher] ws closed`);
  };

  public createWsConnection = async (auth: ILcuAuth) => {
    return new Promise((resolve, reject) => {
      if (this.connectTask) {
        clearTimeout(this.connectTask);
      }

      const ws = new WebSocket(`wss://riot:${auth.token}@127.0.0.1:${auth.port}`, {
        protocol: `wamp`,
      });

      ws.on(`open`, () => {
        ws.send(JSON.stringify([LcuMessageType.SUBSCRIBE, `OnJsonApiEvent`]));
        resolve(ws);
      });

      ws.on(`message`, this.handleLcuMessage);

      ws.on(`error`, (err) => {
        console.error(err.message);
        this.ws = null;

        if (err.message.includes(`connect ECONNREFUSED`)) {
          console.info(`[ws] lcu ws server is not ready, retry in 3s`);
          this.evBus?.emit(LcuEvent.MatchedStartedOrTerminated);
          this.connectTask = setTimeout(() => {
            this.createWsConnection(auth);
          }, 3 * 1000);
        } else {
          reject(err);
        }
      });

      this.ws = ws;
    });
  };

  public onAuthUpdate = async (data: ILcuAuth | null) => {
    if (!data) {
      return;
    }

    if (data.urlWithAuth === this.auth?.urlWithAuth) {
      return;
    }

    this.auth = data;
    this.request = got.extend({
      resolveBodyOnly: true,
      prefixUrl: data.urlWithAuth,
    });
    await this.createWsConnection(data);
  };

  public initListener = () => {
    this.evBus = {
      listeners: [],
      emit: () => null,
    };
    this.evBus!.emit = (ev: string, data?: any) => {
      const listeners = this.evBus!.listeners.filter((i) => i.event === ev);
      listeners.forEach((i) => {
        i.fn(data);

        if (i.once) {
          this.removeListener(ev, i.fn);
        }
      });
    };
  };

  public addListener = (event: LcuEvent, fn: Function, once: boolean = false) => {
    this.evBus!.listeners = (this.evBus!.listeners ?? []).concat({
      event,
      fn,
      once,
    });
  };

  public removeListener = (ev: string, fn: Function) => {
    this.evBus!.listeners = (this.evBus!.listeners ?? []).filter(
      (i) => i.event === ev && i.fn === fn,
    );
  };

  public applyRunePage = async (data: any) => {
    if (!this.auth) {
      throw new Error(`[lcu] no auth available`);
    }

    try {
      const list: IPerkPage[] = await this.request.get(`lol-perks/v1/pages`).json();
      const current = list.find((i) => i.current && i.isDeletable);
      if (current?.id) {
        await this.request.delete(`lol-perks/v1/pages/${current.id}`).json();
      }
      await this.request
        .post(`lol-perks/v1/pages`, {
          json: data,
        })
        .json();
    } catch (err) {
      console.error(err);
      return Promise.reject(err);
    }
  };
}
