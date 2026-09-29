#import <React/RCTBridgeModule.h>
#import <Speech/Speech.h>

@interface JarvisSpeech : NSObject <RCTBridgeModule>
@property(nonatomic, strong) SFSpeechRecognizer *recognizer;
@property(nonatomic, strong) SFSpeechRecognitionTask *task;
@property(nonatomic, assign) BOOL busy;
@end

@implementation JarvisSpeech
RCT_EXPORT_MODULE();
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
RCT_EXPORT_METHOD(transcribe:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if (self.busy) { reject(@"busy", @"이전 음성을 인식하고 있습니다.", nil); return; }
  self.busy = YES;
  [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (status != SFSpeechRecognizerAuthorizationStatusAuthorized) {
        self.busy = NO;
        reject(@"permission", @"iPhone 설정에서 JarvisPocket의 음성 인식 권한을 허용해 주세요.", nil);
        return;
      }
      self.recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:@"ko-KR"]];
      if (!self.recognizer || !self.recognizer.isAvailable) {
        self.busy = NO;
        reject(@"unavailable", @"한국어 음성 인식을 사용할 수 없습니다. 인터넷 연결을 확인해 주세요.", nil);
        return;
      }
      SFSpeechURLRecognitionRequest *request = [[SFSpeechURLRecognitionRequest alloc] initWithURL:[NSURL fileURLWithPath:path]];
      request.shouldReportPartialResults = NO;
      // Prefer on-device recognition; Apple handles supported-language availability.
      request.requiresOnDeviceRecognition = self.recognizer.supportsOnDeviceRecognition;
      __block BOOL finished = NO;
      self.task = [self.recognizer recognitionTaskWithRequest:request resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
          if (finished) return;
          if (result.isFinal || error) {
            finished = YES; self.busy = NO;
            NSString *text = result.bestTranscription.formattedString;
            if (text.length) resolve(text);
            else reject(@"recognition", error.localizedDescription ?: @"말소리를 인식하지 못했습니다. 다시 시도해 주세요.", error);
            self.task = nil;
          }
        });
      }];
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 65 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        if (finished) return;
        finished = YES; self.busy = NO;
        [self.task cancel]; self.task = nil;
        reject(@"timeout", @"음성 인식 시간이 초과됐습니다. 다시 시도해 주세요.", nil);
      });
    });
  }];
}
@end
