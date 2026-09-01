import type { RecordModel } from 'pocketbase';

export type WorkspaceView = 'studio' | 'transcribe' | 'voices' | 'library';
export type VoiceStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface VoiceRecord extends RecordModel {
	owner: string;
	name: string;
	model: string;
	tarka_voice_id: string;
	status: VoiceStatus;
	consent_signed_by: string;
	consent_date: string;
	sample: string;
	error_message?: string;
}

export interface GenerationRecord extends RecordModel {
	owner: string;
	input: string;
	model: string;
	voice_ref: string;
	voice_name?: string;
	response_format: string;
	speed: number;
	instructions?: string;
	audio: string;
	content_type?: string;
	duration_label?: string;
}

export interface TranscriptionRecord extends RecordModel {
	owner: string;
	filename: string;
	model: string;
	language?: string;
	prompt?: string;
	text: string;
	task?: string;
	duration?: number;
	audio: string;
}

export interface TarkaModel {
	id: string;
	object?: string;
	owned_by?: string;
	modality?: string;
	capabilities?: Record<string, unknown>;
}

export interface TarkaModelList {
	object?: string;
	data: TarkaModel[];
}

export interface ActivityItem {
	id: string;
	type: 'generation' | 'transcription';
	title: string;
	subtitle: string;
	created: string;
	audioUrl: string;
	text: string;
	record: GenerationRecord | TranscriptionRecord;
}
