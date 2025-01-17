import { IChampionInfo } from '@interfaces/commonTypes';

export const makeChampMap = (list: { [key: string]: IChampionInfo }) => {
  return Object.values(list).reduce((result, cur) => {
    result[cur.key] = cur;
    return result;
  }, {} as { [key: string]: IChampionInfo });
};
