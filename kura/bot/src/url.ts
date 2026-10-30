export function meetUrl(value: string): string {
 const u = new URL(value);
 if (u.protocol !== 'https:' || u.hostname !== 'meet.google.com' || u.username || u.password || u.port) throw new Error('Use a Google Meet HTTPS link.');
 const match = /^\/(?:meet\/)?([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/.exec(u.pathname);
 if (!match) throw new Error('Use a Google Meet meeting code.');
 return `https://meet.google.com/${match[1]}`;
}
