// src/utils/channel.js
import { setUserInChannel } from "../db/database.js";

/**
 * Add a user to the private channel.
 * The bot must be an Administrator in the channel with "Add Members" permission.
 */
export async function addUserToChannel(bot, telegramId) {
  try {
    await bot.api.unbanChatMember(process.env.CHANNEL_ID, telegramId);
    // Note: For private channels, Telegram requires an invite link rather than
    // direct addChatMember for users who haven't joined before.
    // We unban first (in case they were previously removed), then send an invite.
    setUserInChannel(telegramId, true);
    return true;
  } catch (err) {
    console.error(`[channel] Failed to unban ${telegramId}:`, err.description ?? err.message);
    return false;
  }
}

/**
 * Remove a user from the private channel by banning then immediately unbanning
 * (Telegram has no plain "kick from channel" — ban + revoke access is the way).
 */
export async function removeUserFromChannel(bot, telegramId) {
  try {
    // Ban kicks the user from the channel
    await bot.api.banChatMember(process.env.CHANNEL_ID, telegramId);
    // Immediately unban so they CAN rejoin if they resubscribe
    await bot.api.unbanChatMember(process.env.CHANNEL_ID, telegramId);
    setUserInChannel(telegramId, false);
    return true;
  } catch (err) {
    console.error(`[channel] Failed to remove ${telegramId}:`, err.description ?? err.message);
    return false;
  }
}

/**
 * Generate a single-use invite link for a specific user.
 * Send this to the user after successful payment so only they can join.
 */
export async function createInviteLink(bot, telegramId) {
  const link = await bot.api.createChatInviteLink(process.env.CHANNEL_ID, {
    name: `user_${telegramId}_${Date.now()}`,
    member_limit: 1,          // Only this user can use it
    creates_join_request: false,
  });
  return link.invite_link;
}
