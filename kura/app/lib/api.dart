import 'dart:typed_data';
import 'package:dio/dio.dart';

class KuraApi {
  final Dio dio;
  KuraApi(String base, String token)
    : dio = Dio(
        BaseOptions(
          baseUrl: base.replaceAll(RegExp(r'/$'), ''),
          headers: {if (token.isNotEmpty) 'Authorization': 'Bearer $token'},
          connectTimeout: const Duration(seconds: 20),
          receiveTimeout: const Duration(seconds: 90),
        ),
      );
  Future<dynamic> get(String path) async => (await dio.get('/api/$path')).data;
  Future<dynamic> post(String path, [Map<String, dynamic>? data]) async =>
      (await dio.post('/api/$path', data: data ?? {})).data;
  Future<void> chunk(String id, int seq, Uint8List bytes) async {
    await dio.put(
      '/api/meetings/$id/chunks/$seq',
      data: Stream.value(bytes),
      options: Options(
        contentType: 'application/octet-stream',
        headers: {'Content-Length': bytes.length},
      ),
    );
  }

  Future<void> delete(String id) async {
    await dio.delete('/api/meetings/$id');
  }
}

String errorText(Object e) {
  if (e is DioException) {
    final data = e.response?.data;
    if (data is Map && data['detail'] is String) return data['detail'];
    if (e.response?.statusCode == 401) {
      return 'Your session expired. Please sign in again.';
    }
    return 'Could not reach Kura. Your local recordings are safe. Try again.';
  }
  return e.toString().replaceFirst('Exception: ', '');
}
