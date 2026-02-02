export function marketHourKey(hourKey: string): string {
  // Versioned to avoid getting stuck on stale cached market formats.
  return `fx:market:v2:hour:${hourKey}`;
}

export function marketHourLockKey(hourKey: string): string {
  return `fx:lock:market:v2:hour:${hourKey}`;
}

export function playerAccountKey(playerId: string): string {
  return `fx:acct:${playerId}`;
}

export function leaderboardKey(hourKey: string): string {
  return `fx:lb:${hourKey}`;
}


