import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enUS, { lang as enLang } from './en-us';
import zhCN, { lang as cnLang } from './zh-cn';
import frFR, { lang as frLang } from './fr-fr';
import elGR, { lang as elLang } from './el-gr';

const init = () => {
  i18n.use(initReactI18next).init({
    lng: window.bridge.appConfig.get(`appLang`, enLang),
    fallbackLng: enLang,
    interpolation: {
      escapeValue: false,
    },
    resources: {
      [enLang]: enUS,
      [cnLang]: zhCN,
      [frLang]: frFR,
      [elLang]: elGR,
    },
  });
};

export default init;
