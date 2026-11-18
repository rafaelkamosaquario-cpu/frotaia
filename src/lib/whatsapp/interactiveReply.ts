/** Normalize received interactive replies; never read quoted/outgoing button menus. */
export function interactiveReply(body: {
 listResponseMessage?: {selectedRowId?: string; title?: string; message?: string};
 buttonsResponseMessage?: {buttonId?: string; message?: string};
 buttonReply?: Record<string, unknown>;
 quickReplyButton?: {id?: string; displayText?: string};
}): string | undefined {
 const candidates = [body.listResponseMessage?.selectedRowId, body.buttonsResponseMessage?.buttonId,
  body.buttonReply?.buttonId, body.buttonReply?.id, body.buttonReply?.selectedButtonId,
  body.quickReplyButton?.id, body.listResponseMessage?.title, body.listResponseMessage?.message,
  body.buttonsResponseMessage?.message, body.buttonReply?.displayText, body.buttonReply?.title,
  body.buttonReply?.message, body.buttonReply?.label, body.quickReplyButton?.displayText];
 return candidates.find((v):v is string=>typeof v==='string'&&v.trim().length>0)?.trim();
}

