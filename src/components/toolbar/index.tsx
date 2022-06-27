import s from './style.module.scss';

import React from 'react';
import { useHistory } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import cn from 'classnames';
import { StatefulTooltip } from 'baseui/tooltip';
import { Settings, Minimize2, X } from 'react-feather';
import { useStyletron } from 'baseui';

const Toolbar = () => {
  const [t] = useTranslation();
  const history = useHistory();
  const [css, theme] = useStyletron();
  
  const onHide = () => {
    window.bridge.sendMessage(`toggle-main-window`);
  };
  const onClose = () => {
    window.bridge.sendMessage(`quit-app`);
  };

  return (
    <div className={s.toolbar}>
      <StatefulTooltip accessibilityType={'tooltip'} content={t(`minimize`)}>
        <span className={
                cn(s.icon,
                  css({
                    color: theme.colors.primary,
                  }),
                )}
               onClick={onHide}>
          <Minimize2 size={16} />
        </span>
      </StatefulTooltip>

      <StatefulTooltip accessibilityType={'tooltip'} content={t(`settings`)}>
        <span className={
                cn(s.icon,
                  css({
                    color: theme.colors.primary,
                  }),
                )}
                onClick={() => history.replace(`/settings`)}>
          <Settings size={16} />
        </span>
      </StatefulTooltip>

      <StatefulTooltip accessibilityType={'tooltip'} content={t(`close`)}>
        <span className={
                cn(s.icon,
                  css({
                    color: theme.colors.primary,
                  }),
                )}
                onClick={onClose}>
          <X size={16} />
        </span>
      </StatefulTooltip>
    </div>
  );
};

export default Toolbar;
