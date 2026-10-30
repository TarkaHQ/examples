import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:file_picker/file_picker.dart';
import 'package:just_audio/just_audio.dart';
import 'package:uuid/uuid.dart';
import 'api.dart';
import 'text_prompt.dart';

const ink = Color(0xff183e36),
    paper = Color(0xfff7f5ee),
    amber = Color(0xffe4b35a);
const recorder = MethodChannel('kura/recorder');
const secure = FlutterSecureStorage();
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const KuraApp());
}

class KuraApp extends StatelessWidget {
  const KuraApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Kura · A place for your conversations',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: ink, surface: paper),
      scaffoldBackgroundColor: paper,
      fontFamily: 'sans-serif',
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 18),
          backgroundColor: ink,
          foregroundColor: Colors.white,
        ),
      ),
    ),
    home: const KuraHome(),
  );
}

class KuraHome extends StatefulWidget {
  const KuraHome({super.key});
  @override
  State<KuraHome> createState() => _KuraHomeState();
}

class _KuraHomeState extends State<KuraHome> {
  final email = TextEditingController(),
      password = TextEditingController(),
      server = TextEditingController(
        text: kIsWeb
            ? Uri.base.origin
            : const String.fromEnvironment('KURA_URL'),
      );
  KuraApi? api;
  List<dynamic> meetings = [], drafts = [];
  Map<dynamic, dynamic> recording = {};
  Map<String, dynamic>? selected;
  Timer? timer;
  bool busy = false, refreshing = false;
  String? error, notice;
  String progress = '';
  PlatformFile? pendingFile;
  String? pendingFileId;
  int ticks = 0;
  final player = AudioPlayer();
  bool playing = false;
  bool get android =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
  @override
  void initState() {
    super.initState();
    restore();
    timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (android) pollRecorder();
      if (++ticks % 5 == 0 && api != null && !busy) refresh();
      if (ticks % 30 == 0 && api != null && !busy && drafts.isNotEmpty) {
        run(() => uploadDraft(drafts.first));
      }
    });
    player.playerStateStream.listen((s) {
      if (mounted) {
        setState(
          () => playing =
              s.playing && s.processingState != ProcessingState.completed,
        );
      }
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    player.dispose();
    email.dispose();
    password.dispose();
    server.dispose();
    super.dispose();
  }

  Future<void> restore() async {
    if (!kIsWeb) {
      try {
        server.text = await secure.read(key: 'server') ?? server.text;
        final token = await secure.read(key: 'token');
        if (token != null && server.text.isNotEmpty) {
          api = KuraApi(server.text, token);
          await refresh();
        }
      } catch (_) {}
    }
    if (android) await pollRecorder();
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => error = errorText(e));
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
          progress = '';
        });
      }
    }
  }

  Future<void> login() async {
    final uri = Uri.tryParse(server.text.trim());
    if (uri == null ||
        uri.scheme != 'https' &&
            (uri.host != 'localhost' && uri.host != '127.0.0.1')) {
      throw Exception('Enter your Kura HTTPS address.');
    }
    final client = KuraApi(server.text.trim(), '');
    final data = await client.post('login', {
      'email': email.text.trim(),
      'password': password.text,
    });
    api = KuraApi(server.text.trim(), data['token']);
    password.clear();
    if (!kIsWeb) {
      await secure.write(key: 'token', value: data['token']);
      await secure.write(key: 'server', value: server.text.trim());
    }
    await refresh();
  }

  Future<void> refresh() async {
    if (refreshing || api == null) return;
    refreshing = true;
    try {
      final list = await api!.get('meetings');
      Map<String, dynamic>? detail;
      if (selected != null) {
        detail = Map<String, dynamic>.from(
          await api!.get('meetings/${selected!['id']}'),
        );
      }
      if (mounted) {
        setState(() {
          meetings = list;
          if (detail != null) selected = detail;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = errorText(e));
    } finally {
      refreshing = false;
    }
  }

  Future<void> pollRecorder() async {
    try {
      final state = await recorder.invokeMapMethod('status') ?? {};
      final saved = await recorder.invokeListMethod('recordings') ?? [];
      if (mounted) {
        setState(() {
          recording = state;
          drafts = saved;
        });
      }
    } catch (_) {}
  }

  Future<String?> ask(String title, String hint, {String initial = ''}) async {
    final result = await showDialog<String>(
      context: context,
      builder: (_) => TextPrompt(title: title, hint: hint, initial: initial),
    );
    return result?.trim();
  }

  Future<void> startRecording() async {
    final title = await ask('Record a conversation', 'Give it a name');
    if (title == null || title.isEmpty) return;
    if (await recorder.invokeMethod('permission') != true) {
      throw Exception('Microphone permission is needed to record.');
    }
    await recorder.invokeMethod('start', {'title': title});
    await Future<void>.delayed(const Duration(milliseconds: 300));
    await pollRecorder();
  }

  Future<void> joinMeet() async {
    final url = await ask(
      'Send Kura to Google Meet',
      'Paste a Google Meet link',
    );
    if (url == null || url.isEmpty) return;
    final m = await api!.post('meetings', {
      'client_id': const Uuid().v4(),
      'title':
          'Google Meet · ${DateTime.now().toLocal().toString().substring(0, 16)}',
      'source': 'meet',
      'meet_url': url,
    });
    setState(() => selected = Map<String, dynamic>.from(m));
    await refresh();
  }

  Future<void> uploadDraft(Map draft) async {
    if (api == null) {
      throw Exception(
        'Sign in to upload. Your recording is saved on this phone.',
      );
    }
    final count = draft['chunks'] as int;
    if (count == 0) throw Exception('This recording has no audio.');
    final m = await api!.post('meetings', {
      'client_id': draft['id'],
      'title': draft['title'],
      'source': 'phone',
      'upload_kind': 'segments',
    });
    final id = m['id'];
    final detail = await api!.get('meetings/$id');
    final uploaded = (detail['uploaded_chunks'] as List).toSet();
    for (var seq = 0; seq < count; seq++) {
      setState(
        () => progress = 'Uploading ${seq + 1} of $count audio segments',
      );
      if (uploaded.contains(seq)) continue;
      final bytes = await recorder.invokeMethod<Uint8List>('readChunk', {
        'id': draft['id'],
        'seq': seq,
      });
      await api!.chunk(id, seq, bytes!);
    }
    await api!.post('meetings/$id/finish', {'chunks': count});
    await recorder.invokeMethod('delete', {'id': draft['id']});
    await pollRecorder();
    await refresh();
    setState(
      () => notice = 'Recording saved to Kura. Your notes are on their way.',
    );
  }

  Future<void> uploadFile() async {
    final file = pendingFile ?? await FilePicker.pickFile(type: FileType.audio);
    if (file == null) return;
    pendingFile = file;
    pendingFileId ??= const Uuid().v4();
    final size = await file.xFile.length();
    if (size > 512 * 1024 * 1024) {
      throw Exception('Choose audio smaller than 512 MiB.');
    }
    final m = await api!.post('meetings', {
      'client_id': pendingFileId,
      'title': file.name,
      'source': 'upload',
      'upload_kind': 'file',
    });
    final id = m['id'];
    var seq = 0;
    final detail = await api!.get('meetings/$id');
    final uploaded = (detail['uploaded_chunks'] as List).toSet();
    // XFile range streams keep memory bounded even for long browser uploads.
    for (var offset = 0; offset < size; offset += 2 * 1024 * 1024) {
      final end = min(offset + 2 * 1024 * 1024, size);
      setState(() => progress = 'Uploading ${(100 * offset / size).round()}%');
      final bytes = BytesBuilder();
      await for (final part in file.xFile.openRead(offset, end)) {
        bytes.add(part);
      }
      if (!uploaded.contains(seq)) {
        await api!.chunk(id, seq, bytes.takeBytes());
      }
      seq++;
    }
    await api!.post('meetings/$id/finish', {'chunks': seq});
    pendingFile = null;
    pendingFileId = null;
    await refresh();
    setState(() => notice = 'Audio uploaded. Your notes are on their way.');
  }

  Future<void> openMeeting(dynamic m) async {
    await player.stop();
    final detail = await api!.get('meetings/${m['id']}');
    setState(() => selected = Map<String, dynamic>.from(detail));
  }

  Future<void> play([double? seconds]) async {
    if (selected == null) return;
    if (playing && seconds == null) {
      await player.pause();
      return;
    }
    final m = await api!.get('meetings/${selected!['id']}');
    if (m['audio_url'] == null) return;
    await player.setUrl(m['audio_url']);
    if (seconds != null) {
      await player.seek(Duration(milliseconds: (seconds * 1000).round()));
    }
    unawaited(player.play());
  }

  Future<void> exportNotes() async {
    final data = await api!.dio.get('/api/meetings/${selected!['id']}/export');
    await FilePicker.saveFile(
      fileName: 'kura-notes.md',
      bytes: Uint8List.fromList(utf8.encode(data.data.toString())),
    );
  }

  Future<void> deleteMeeting() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Delete this conversation?'),
        content: const Text('Its audio, transcript and notes will be removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    await api!.delete(selected!['id']);
    await player.stop();
    setState(() => selected = null);
    await refresh();
  }

  String stamp(num seconds) {
    final n = seconds.toInt();
    return '${(n ~/ 60).toString().padLeft(2, '0')}:${(n % 60).toString().padLeft(2, '0')}';
  }

  Widget title(String text, {double size = 28}) => Text(
    text,
    style: TextStyle(
      fontSize: size,
      fontWeight: FontWeight.w700,
      color: ink,
      letterSpacing: -.7,
    ),
  );
  Widget box(Widget child) => Card(
    child: Padding(padding: const EdgeInsets.all(24), child: child),
  );
  Widget pill(String status) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    decoration: BoxDecoration(
      color: status == 'ready'
          ? const Color(0xffe3eee6)
          : status == 'failed'
          ? const Color(0xffffe9e3)
          : const Color(0xfff8eed7),
      borderRadius: BorderRadius.circular(30),
    ),
    child: Text(
      status.replaceAll('_', ' '),
      style: const TextStyle(
        fontSize: 12,
        color: ink,
        fontWeight: FontWeight.w600,
      ),
    ),
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1120),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 20, 16, 12),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: ink,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(Icons.graphic_eq, color: amber),
                    ),
                    const SizedBox(width: 12),
                    title('kura', size: 30),
                    const SizedBox(width: 10),
                    const Text('कुरा', style: TextStyle(color: ink)),
                    const Spacer(),
                    if (api != null)
                      IconButton(
                        tooltip: 'Sign out',
                        onPressed: busy
                            ? null
                            : () => run(() async {
                                await api!.post('logout');
                                await secure.delete(key: 'token');
                                setState(() {
                                  api = null;
                                  selected = null;
                                  meetings = [];
                                });
                              }),
                        icon: const Icon(Icons.logout),
                      ),
                  ],
                ),
              ),
              if (busy) const LinearProgressIndicator(minHeight: 2),
              if (progress.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Text(progress),
                ),
              if (error != null || notice != null)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 8,
                  ),
                  child: MaterialBanner(
                    content: Text(error ?? notice!),
                    backgroundColor: error != null
                        ? const Color(0xffffe9e3)
                        : const Color(0xffe3eee6),
                    actions: [
                      TextButton(
                        onPressed: () => setState(() {
                          error = null;
                          notice = null;
                        }),
                        child: const Text('Dismiss'),
                      ),
                    ],
                  ),
                ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
                  child: selected != null
                      ? detail()
                      : api == null
                      ? signIn()
                      : library(),
                ),
              ),
              const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: Text(
                  'A little space for every conversation.  ·  Powered by Tarka',
                  style: TextStyle(fontSize: 11, color: Colors.black45),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  Widget signIn() => Column(
    children: [
      const SizedBox(height: 24),
      title('Be in the conversation.', size: 36),
      const SizedBox(height: 10),
      const Text(
        'Kura takes care of the notes.',
        style: TextStyle(fontSize: 18, color: Colors.black54),
      ),
      const SizedBox(height: 28),
      ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: box(
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              title('Welcome back', size: 23),
              const SizedBox(height: 20),
              if (!kIsWeb) ...[
                TextField(
                  controller: server,
                  decoration: const InputDecoration(
                    labelText: 'Your Kura address',
                    hintText: 'https://kura-….tarka.site',
                  ),
                ),
                const SizedBox(height: 12),
              ],
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.username],
                decoration: const InputDecoration(labelText: 'Email'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: password,
                obscureText: true,
                autofillHints: const [AutofillHints.password],
                decoration: const InputDecoration(labelText: 'Password'),
                onSubmitted: (_) => run(login),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: busy ? null : () => run(login),
                child: const Text('Sign in'),
              ),
              const SizedBox(height: 12),
              const Text(
                'Your private meeting library.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.black54),
              ),
            ],
          ),
        ),
      ),
      if (android) ...[const SizedBox(height: 24), recordCard(), draftList()],
    ],
  );
  Widget recordCard() => box(
    Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.mic_none, color: ink),
            const SizedBox(width: 12),
            Expanded(
              child: title(
                recording['active'] == true
                    ? 'Your conversation, captured.'
                    : 'In the same room?',
                size: 22,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (recording['active'] == true) ...[
          Text(
            stamp(recording['seconds'] ?? 0),
            style: const TextStyle(
              fontSize: 46,
              fontWeight: FontWeight.w300,
              color: ink,
            ),
          ),
          const SizedBox(height: 10),
          LinearProgressIndicator(
            value: (recording['amplitude'] as num? ?? 0).toDouble(),
            backgroundColor: paper,
            color: amber,
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 12,
            children: [
              OutlinedButton.icon(
                onPressed: busy
                    ? null
                    : () => run(() async {
                        await recorder.invokeMethod('pause');
                        await pollRecorder();
                      }),
                icon: Icon(
                  recording['paused'] == true ? Icons.play_arrow : Icons.pause,
                ),
                label: Text(recording['paused'] == true ? 'Resume' : 'Pause'),
              ),
              FilledButton.icon(
                onPressed: busy
                    ? null
                    : () => run(() async {
                        await recorder.invokeMethod('stop');
                        await Future<void>.delayed(
                          const Duration(milliseconds: 500),
                        );
                        await pollRecorder();
                      }),
                icon: const Icon(Icons.stop),
                label: const Text('Stop & save'),
              ),
            ],
          ),
        ] else ...[
          const Text(
            'Record on your phone, even offline. Let everyone know before you start.',
            style: TextStyle(color: Colors.black54),
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: busy ? null : () => run(startRecording),
            icon: const Icon(Icons.mic),
            label: const Text('Record conversation'),
          ),
        ],
        if ((recording['error'] ?? '').toString().isNotEmpty)
          Text(recording['error']),
      ],
    ),
  );
  Widget draftList() => Column(
    children: drafts
        .map(
          (d) => box(
            Row(
              children: [
                const Icon(Icons.phone_android, color: ink),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        d['title'],
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const Text(
                        'Saved on this phone',
                        style: TextStyle(fontSize: 12, color: Colors.black54),
                      ),
                    ],
                  ),
                ),
                if (api != null)
                  TextButton(
                    onPressed: busy ? null : () => run(() => uploadDraft(d)),
                    child: const Text('Upload'),
                  ),
              ],
            ),
          ),
        )
        .toList(),
  );
  Widget library() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      title('Good conversations.\nNothing forgotten.', size: 36),
      const SizedBox(height: 12),
      const Text(
        'Record, listen back, and find what matters.',
        style: TextStyle(fontSize: 17, color: Colors.black54),
      ),
      const SizedBox(height: 26),
      if (android) recordCard(),
      box(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            title('Bring Kura along', size: 22),
            const SizedBox(height: 12),
            const Text(
              'Paste a Google Meet link and admit Kura when it arrives.',
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                FilledButton.icon(
                  onPressed: busy ? null : () => run(joinMeet),
                  icon: const Icon(Icons.video_call_outlined),
                  label: const Text('Join Google Meet'),
                ),
                OutlinedButton.icon(
                  onPressed: busy ? null : () => run(uploadFile),
                  icon: const Icon(Icons.upload_file),
                  label: Text(
                    pendingFile != null ? 'Resume upload' : 'Upload audio',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      if (android) draftList(),
      const SizedBox(height: 28),
      Row(
        children: [
          title('Your conversations', size: 24),
          const Spacer(),
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => run(refresh),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      const SizedBox(height: 12),
      if (meetings.isEmpty)
        box(
          const Column(
            children: [
              Icon(Icons.forum_outlined, size: 44, color: ink),
              SizedBox(height: 14),
              Text('Your first conversation starts here.'),
              SizedBox(height: 8),
              Text(
                'Meeting notes will appear here when you record or upload audio.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.black54),
              ),
            ],
          ),
        ),
      ...meetings.map(
        (m) => Card(
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 24,
              vertical: 14,
            ),
            leading: Icon(
              m['source'] == 'meet'
                  ? Icons.videocam_outlined
                  : Icons.graphic_eq,
              color: ink,
            ),
            title: Text(
              m['title'],
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            subtitle: Text(m['created_at'].toString().substring(0, 10)),
            trailing: pill(m['status']),
            onTap: () => run(() => openMeeting(m)),
          ),
        ),
      ),
    ],
  );
  Widget detail() {
    final m = selected!,
        notes = m['notes'] as Map? ?? {},
        segments = m['segments'] as List? ?? [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextButton.icon(
          onPressed: () => setState(() => selected = null),
          icon: const Icon(Icons.arrow_back),
          label: const Text('All conversations'),
        ),
        const SizedBox(height: 16),
        title(m['title'], size: 30),
        const SizedBox(height: 12),
        pill(m['status']),
        if (m['partial'] == true)
          const Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text(
              'This recording was interrupted. These notes cover the recovered audio.',
            ),
          ),
        const SizedBox(height: 20),
        if (['queued', 'joining', 'waiting', 'recording'].contains(m['status']))
          box(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  m['status'] == 'waiting'
                      ? 'Kura is waiting. Please admit it in Google Meet.'
                      : 'Kura is ${m['status']}. Your notes will appear after the meeting.',
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () => run(() async {
                    await api!.post('meetings/${m['id']}/stop');
                    await refresh();
                  }),
                  child: const Text('Stop bot'),
                ),
              ],
            ),
          ),
        if (m['error'].toString().isNotEmpty)
          box(
            Column(
              children: [
                Text(m['error']),
                if (m['status'] == 'failed' && m['expected_chunks'] != null)
                  TextButton(
                    onPressed: () => run(() async {
                      await api!.post('meetings/${m['id']}/retry');
                      await refresh();
                    }),
                    child: const Text('Retry processing'),
                  ),
              ],
            ),
          ),
        if (m['audio_url'] != null)
          Wrap(
            spacing: 12,
            children: [
              FilledButton.icon(
                onPressed: () => run(() => play()),
                icon: Icon(playing ? Icons.pause : Icons.play_arrow),
                label: Text(playing ? 'Pause' : 'Listen back'),
              ),
              OutlinedButton.icon(
                onPressed: () => run(exportNotes),
                icon: const Icon(Icons.download),
                label: const Text('Export notes'),
              ),
            ],
          ),
        const SizedBox(height: 20),
        if (notes.isNotEmpty)
          box(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                title('The short version', size: 23),
                const SizedBox(height: 14),
                SelectableText(
                  notes['summary'] ?? '',
                  style: const TextStyle(fontSize: 16, height: 1.6),
                ),
                if ((notes['decisions'] as List? ?? []).isNotEmpty) ...[
                  const SizedBox(height: 24),
                  title('Decisions', size: 18),
                  ...((notes['decisions'] as List).map(
                    (d) => Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text('•  $d'),
                    ),
                  )),
                ],
                if ((notes['action_items'] as List? ?? []).isNotEmpty) ...[
                  const SizedBox(height: 24),
                  title('Next steps', size: 18),
                  ...((notes['action_items'] as List).map(
                    (a) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(
                        Icons.check_box_outline_blank,
                        color: ink,
                      ),
                      title: Text(a['task']),
                      subtitle: Text(
                        [
                          a['owner'],
                          a['due'],
                        ].where((s) => s != null).join(' · '),
                      ),
                    ),
                  )),
                ],
                const SizedBox(height: 18),
                const Text(
                  'AI-generated notes. Check important details against the recording.',
                  style: TextStyle(fontSize: 12, color: Colors.black54),
                ),
              ],
            ),
          ),
        if (segments.isNotEmpty)
          box(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                title('In their words', size: 23),
                const SizedBox(height: 14),
                ...segments.map(
                  (s) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        TextButton(
                          onPressed: m['audio_url'] == null
                              ? null
                              : () => run(
                                  () => play((s['start'] as num).toDouble()),
                                ),
                          child: Text(stamp(s['start'])),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: SelectableText(
                            s['text'],
                            style: const TextStyle(height: 1.6),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 20),
        TextButton.icon(
          onPressed: () => run(deleteMeeting),
          icon: const Icon(Icons.delete_outline),
          label: const Text('Delete conversation'),
        ),
      ],
    );
  }
}
