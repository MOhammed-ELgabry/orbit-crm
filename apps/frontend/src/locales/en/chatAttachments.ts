/** Chat attachments (images and PDF in direct conversations). */
const chatAttachments = {
  chatAttachFile: "Attach an image or PDF",
  chatAttachmentRemove: "Remove attachment",
  chatAttachmentRetry: "Try uploading again",
  chatAttachmentUploading: "Uploading… {{percent}}%",
  chatAttachmentUploadingLabel: "Uploading {{name}}",
  chatAttachmentReady: "Ready to send",
  chatAttachmentWaitUpload: "Wait for the upload to finish before sending.",
  chatAttachmentFixFirst: "Fix or remove the attachment to send.",
  chatAttachmentLoading: "Loading {{name}}",
  chatAttachmentEnlarge: "Enlarge image {{name}}",
  chatAttachmentShrink: "Shrink image {{name}}",
  chatAttachmentDownload: "Download {{name}}",
  chatAttachmentUnavailable: "This attachment is no longer available.",
  chatAttachmentPreviewImage: "📷 Photo",
  chatAttachmentPreviewPdf: "📄 PDF",

  chatAttachmentErrDisabled: "Attachments are not available right now.",
  chatAttachmentErrDirectOnly:
    "Attachments can only be sent in one-to-one conversations.",
  chatAttachmentErrEmpty: "This file is empty.",
  chatAttachmentErrUnsupported:
    "Only PNG, JPEG, WebP images and PDF files are supported.",
  chatAttachmentErrCorrupt:
    "This file is damaged or is not what it claims to be.",
  chatAttachmentErrTooLarge:
    "This file is too large (images up to 5 MB, PDF up to 10 MB).",
  chatAttachmentErrDimensions: "This image is too large in dimensions.",
  chatAttachmentErrPdfEncrypted:
    "Password-protected PDF files are not accepted.",
  chatAttachmentErrPdfActive:
    "This PDF contains active content (scripts or embedded files) and was not accepted.",
  chatAttachmentErrQuotaPending:
    "You have too many attachments waiting to be sent. Send or remove one first.",
  chatAttachmentErrQuotaDaily: "You reached today's attachment limit.",
  chatAttachmentErrStorageFull:
    "Attachment storage is full. Please contact your administrator.",
  chatAttachmentErrBusy: "The server is busy. Please try again in a moment.",
  chatAttachmentErrStorage: "Attachments are temporarily unavailable.",
  chatAttachmentErrExpired: "This attachment expired. Upload it again.",
  chatAttachmentErrNotReady:
    "The attachment could not be sent. Upload it again.",
  chatAttachmentErrUsed: "This attachment was already sent.",
  chatAttachmentErrInvalid: "The upload was not valid. Please try again.",
  chatAttachmentErrNetwork:
    "Connection problem. Check your connection and try again.",
  chatAttachmentErrGeneric: "The attachment could not be processed.",
};

export default chatAttachments;
