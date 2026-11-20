// Discord treats the presence of voice configuration as opt-in.
export function configureDiscordVoiceIdentity(discord) {
  for (const account of [discord, ...Object.values(discord.accounts ?? {})]) {
    if (!account.voice || account.voice.enabled === false) continue;
    account.voice.realtime ??= {};
    account.voice.realtime.instructions ??=
      "You are Nori speaking in a live Discord voice channel. Match the speaker's language and keep spoken replies brief and natural.";
  }
}
