import { BellRing } from 'lucide-react';
import { Modal, LoadingButton } from '../ui';
import { isPushSupported } from '../../pwa/pushNotifications';

const PROMPT_KEY = 'push_prompt_state';

function readPromptState() {
  try {
    return localStorage.getItem(PROMPT_KEY) || '';
  } catch {
    return '';
  }
}

function writePromptState(value) {
  try {
    localStorage.setItem(PROMPT_KEY, value);
  } catch {
    // ignore storage failures
  }
}

export function shouldShowPushPrompt() {
  if (!isPushSupported()) return false;
  if (Notification.permission === 'granted') return false;
  if (Notification.permission === 'denied') return false;
  const state = readPromptState();
  return state !== 'dismissed' && state !== 'subscribed';
}

export default function PwaPushPrompt({
  isOpen,
  enabling,
  onEnable,
  onDismiss,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onDismiss}
      title="Enable desktop alerts"
      subtitle="Get native notifications on your computer when visitors arrive or need host approval."
      size="sm"
      footer={(
        <>
          <LoadingButton variant="secondary" onClick={onDismiss} disabled={enabling}>
            Not now
          </LoadingButton>
          <LoadingButton
            variant="reception"
            icon={BellRing}
            loading={enabling}
            loadingLabel="Enabling…"
            onClick={onEnable}
          >
            Enable alerts
          </LoadingButton>
        </>
      )}
    >
      <p className="text-sm text-navy-600">
        Works best after installing the app. You can change browser notification settings later in your OS or browser preferences.
      </p>
    </Modal>
  );
}

export { readPromptState, writePromptState, PROMPT_KEY };
