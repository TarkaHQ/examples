import { env } from '$env/dynamic/public';
import PocketBase, { type RecordModel } from 'pocketbase';

export const pocketBaseUrl = env.PUBLIC_POCKETBASE_URL || 'https://pb.boli.tarka.site';
export const pb = new PocketBase(pocketBaseUrl);

pb.autoCancellation(false);

export async function protectedFileURL(record: RecordModel, filename: string, token?: string) {
	if (!filename) return '';
	const fileToken = token || (await pb.files.getToken());
	return pb.files.getURL(record, filename, { token: fileToken });
}
