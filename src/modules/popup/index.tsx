import React, { useEffect } from 'react';

import { Client as Styletron } from 'styletron-engine-atomic';
import { Provider as StyletronProvider } from 'styletron-react';
import { LightTheme, BaseProvider } from 'baseui';
import initI18n from 'src/modules/i18n';
import { Content } from './content';
import { darkTheme } from 'src/DarkTheme';

initI18n();
const engine = new Styletron();

export default function Popup() {
  useEffect(() => {
    initI18n();
  }, []);

  return (
    <StyletronProvider value={engine}>
      <BaseProvider
        theme={window.bridge.appConfig.get('darkTheme', true) ? darkTheme : LightTheme}>
        <Content />
      </BaseProvider>
    </StyletronProvider>
  );
}
