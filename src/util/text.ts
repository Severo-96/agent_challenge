const MAX_MESSAGE_LENGTH = 50;

/**
 * Truncate a message for storing as session first_message.
 */
export function truncateFirstMessage(msg: string): string {
  if (!msg) return "";
  return msg.length > MAX_MESSAGE_LENGTH ? `${msg.slice(0, MAX_MESSAGE_LENGTH)}...` : msg;
}

