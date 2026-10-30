import 'package:flutter/material.dart';

class TextPrompt extends StatefulWidget {
  const TextPrompt({
    super.key,
    required this.title,
    required this.hint,
    this.initial = '',
  });

  final String title, hint, initial;

  @override
  State<TextPrompt> createState() => _TextPromptState();
}

class _TextPromptState extends State<TextPrompt> {
  late final controller = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    // The route keeps the field alive during its closing animation.
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.title),
    content: TextField(
      controller: controller,
      autofocus: true,
      decoration: InputDecoration(hintText: widget.hint),
      onSubmitted: (value) => Navigator.pop(context, value),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () => Navigator.pop(context, controller.text),
        child: const Text('Continue'),
      ),
    ],
  );
}
