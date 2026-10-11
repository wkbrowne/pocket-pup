import AVFoundation
import SwiftUI
import WebKit

/// Full-screen shell around the game page bundled in the Web folder. Saves live in the web view's local storage.
@main
struct PopulationPupApp: App {
    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea()
                .statusBarHidden()
                .persistentSystemOverlays(.hidden)
                .background(Color(red: 0x2B / 255, green: 0x23 / 255, blue: 0x50 / 255))
        }
    }
}

struct GameView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // Listening questions are read aloud by the device's own voice: the page calls PupSpeech, as it does in the Android app.
        config.userContentController.add(context.coordinator, name: "pup")
        config.userContentController.addUserScript(WKUserScript(source: """
            window.PupSpeech = {
              ok: function () { return true; },
              speak: function (text) { window.webkit.messageHandlers.pup.postMessage({speak: String(text)}); },
              stop: function () { window.webkit.messageHandlers.pup.postMessage({stop: true}); }
            };
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0x2B / 255, green: 0x23 / 255, blue: 0x50 / 255, alpha: 1)
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsLinkPreview = false
        context.coordinator.web = web

        if let dir = Bundle.main.url(forResource: "Web", withExtension: nil) {
            web.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir)
        }
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler, AVSpeechSynthesizerDelegate {
        weak var web: WKWebView?
        private let voice = AVSpeechSynthesizer()
        private var stopping = false

        override init() {
            super.init()
            voice.delegate = self
            // Leaving the app (Home, app switcher, screen off) saves the game first.
            NotificationCenter.default.addObserver(self, selector: #selector(leaving), name: UIApplication.willResignActiveNotification, object: nil)
        }

        @objc private func leaving() {
            web?.evaluateJavaScript("window.pocketSave && window.pocketSave()")
            if voice.isSpeaking { stopping = true; voice.stopSpeaking(at: .immediate) }
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else { return }
            if let text = body["speak"] as? String {
                if voice.isSpeaking { stopping = true; voice.stopSpeaking(at: .immediate) }
                let line = AVSpeechUtterance(string: text)
                line.voice = AVSpeechSynthesisVoice(language: "en-US")
                line.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
                stopping = false
                voice.speak(line)
            } else if body["stop"] != nil, voice.isSpeaking {
                stopping = true
                voice.stopSpeaking(at: .immediate)
            }
        }

        func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
            web?.evaluateJavaScript("window.pupSpeechDone && window.pupSpeechDone(true)")
        }

        // A cancelled line was stopped by the page itself, which no longer waits for it.
        func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) { stopping = false }
    }
}
