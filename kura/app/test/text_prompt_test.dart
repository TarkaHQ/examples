import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kura/text_prompt.dart';

void main() {
  testWidgets('submitting a focused prompt survives the closing animation', (
    tester,
  ) async {
    String? result;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            return Scaffold(
              body: TextButton(
                onPressed: () async {
                  result = await showDialog<String>(
                    context: context,
                    builder: (_) =>
                        const TextPrompt(title: 'Record', hint: 'Name'),
                  );
                },
                child: const Text('Open'),
              ),
            );
          },
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Team meeting');
    await tester.tap(find.text('Continue'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();
    expect(result, 'Team meeting');
    expect(tester.takeException(), isNull);
    expect(find.byType(TextPrompt), findsNothing);
  });
}
