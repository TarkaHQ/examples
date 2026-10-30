import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kura/main.dart';
void main(){
 testWidgets('shows a private sign-in screen before loading meetings',(tester)async{
  debugDefaultTargetPlatformOverride=TargetPlatform.linux;
  await tester.pumpWidget(const KuraApp());
  await tester.pump();
  expect(find.text('Welcome back'),findsOneWidget);
  expect(find.text('Sign in'),findsOneWidget);
  expect(find.text('Email'),findsOneWidget);
  await tester.pumpWidget(const SizedBox());
  debugDefaultTargetPlatformOverride=null;
 });
}
