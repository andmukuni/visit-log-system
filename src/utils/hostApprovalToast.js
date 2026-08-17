export function toastHostApprovalRequested(toast, data, successMessage) {
  toast.success(successMessage);
  if (data && data.hostContactDeliverable === false) {
    toast.warning('The host has no email or phone on file, so the approval link could not be sent.');
  }
}
