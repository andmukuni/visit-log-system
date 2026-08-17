function copyApprovalUrl(url) {
  if (!url || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return Promise.resolve(false);
  }
  return navigator.clipboard.writeText(url).then(() => true).catch(() => false);
}

export function toastHostApprovalRequested(toast, data, successMessage) {
  const url = data?.approvalUrl || null;
  const copyAction = url
    ? {
        label: 'Copy link',
        onClick: () => {
          void copyApprovalUrl(url).then((copied) => {
            if (copied) toast.success('Approval link copied.');
          });
        },
      }
    : undefined;

  toast.success(successMessage, copyAction ? { action: copyAction } : undefined);

  if (data && data.hostContactDeliverable === false) {
    toast.warning(
      url
        ? 'The host has no email or phone on file. Copy the approval link to share it.'
        : 'The host has no email or phone on file, so the approval link could not be sent.',
      copyAction ? { action: copyAction, duration: 12000 } : undefined,
    );
  }
}
