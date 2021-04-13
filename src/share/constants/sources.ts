export const Sources = {
  Opgg: 'op.gg',
  Lolqq: 'lol.qq.com',
  MurderBridge: `murderbridge.com`,
};

export const QQServicePrefix = `https://game.gtimg.cn`;

export const QQChampionAvatarPrefix = `${QQServicePrefix}/images/lol/act/img/champion`;

export interface IPkgItem {
  label: string;
  value: string;
  isAram?: boolean;
}

export const PkgList: IPkgItem[] = [
  {
    label: `op.gg`,
    value: `op.gg`,
  },
  {
    label: `murderbridge.com`,
    value: `murderbridge`,
    isAram: true,
  },
  {
    label: `op.gg-aram`,
    value: `op.gg-aram`,
    isAram: true,
  },
];

export const SourceList = [
  {
    label: Sources.Lolqq,
    value: Sources.Lolqq,
  },
  ...PkgList,
];

export default Sources;