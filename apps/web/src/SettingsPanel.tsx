import type { SubtitlePositionOption, SubtitleSizeOption, ThemeMode } from './types';

type SettingsPanelProps = {
  cuesCount: number;
  fileName: string;
  onClose: () => void;
  onSubtitlePositionChange: (position: SubtitlePositionOption) => void;
  onSubtitleSizeChange: (size: SubtitleSizeOption) => void;
  onThemeModeChange: (theme: ThemeMode) => void;
  subtitlePosition: SubtitlePositionOption;
  subtitleSize: SubtitleSizeOption;
  themeMode: ThemeMode;
};

export function SettingsPanel({
  cuesCount,
  fileName,
  onClose,
  onSubtitlePositionChange,
  onSubtitleSizeChange,
  onThemeModeChange,
  subtitlePosition,
  subtitleSize,
  themeMode,
}: SettingsPanelProps) {
  return (
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        aria-label="Subtitle settings"
        aria-modal="true"
        className="settings-panel"
        role="dialog"
      >
        <div className="modal-header">
          <h2>Subtitle Settings</h2>
          <button
            aria-label="Close subtitle settings"
            className="modal-close-button"
            type="button"
            onClick={onClose}
          >
            X
          </button>
        </div>

        <section className="settings-group">
          <h3>Size</h3>
          <div className="segmented-control">
            {(['small', 'medium', 'large', 'extra_large'] as const).map(
              (size) => (
                <button
                  className={subtitleSize === size ? 'selected' : ''}
                  key={size}
                  type="button"
                  onClick={() => onSubtitleSizeChange(size)}
                >
                  {size === 'extra_large' ? 'XL' : size[0].toUpperCase() + size.slice(1)}
                </button>
              ),
            )}
          </div>
        </section>

        <section className="settings-group">
          <h3>Position</h3>
          <div className="segmented-control">
            {(['top', 'center', 'bottom'] as const).map((position) => (
              <button
                className={subtitlePosition === position ? 'selected' : ''}
                key={position}
                type="button"
                onClick={() => onSubtitlePositionChange(position)}
              >
                {position[0].toUpperCase() + position.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-group">
          <h3>Theme</h3>
          <div className="segmented-control">
            {(['dark', 'light', 'system'] as const).map((theme) => (
              <button
                className={themeMode === theme ? 'selected' : ''}
                key={theme}
                type="button"
                onClick={() => onThemeModeChange(theme)}
              >
                {theme[0].toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-group meta-readout">
          <h3>Subtitle File</h3>
          <div>
            <span>{fileName}</span>
            <span>{cuesCount} cues</span>
          </div>
        </section>
      </aside>
    </div>
  );
}
