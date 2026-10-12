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

        if let dir = Bundle.main.url(forResource: "Web", withExtension: nil) {
            config.setURLSchemeHandler(BundleFiles(root: dir), forURLScheme: "pup")
        }
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0x2B / 255, green: 0x23 / 255, blue: 0x50 / 255, alpha: 1)
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsLinkPreview = false
        context.coordinator.web = web

        // The game is opened from pup://game/, not from a file. A page opened from a file cannot fetch other files,
        // start a worker that loads scripts, or load WebAssembly, and the reading voice needs all three.
        let voiceTest = ProcessInfo.processInfo.environment["PUP_VOICETEST"] != nil
        web.load(URLRequest(url: URL(string: "pup://game/index.html" + (voiceTest ? "#voicetest" : ""))!))
        if voiceTest { context.coordinator.reportVoice(0) }
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

        // Used when checking a build: logs whether the bundled reading voice loaded.
        func reportVoice(_ n: Int) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
                self?.web?.evaluateJavaScript("window.pupVoiceState ? window.pupVoiceState() : 'page not ready'") { r, _ in
                    NSLog("PUPVOICE %d %@", n, String(describing: r ?? "nil"))
                    if n < 16 { self?.reportVoice(n + 1) }
                }
            }
        }

        // A cancelled line was stopped by the page itself, which no longer waits for it.
        func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) { stopping = false }
    }
}

/// Serves the files in the app's Web folder at pup://game/.
final class BundleFiles: NSObject, WKURLSchemeHandler {
    private let root: URL
    init(root: URL) { self.root = root.standardizedFileURL }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { task.didFailWithError(URLError(.badURL)); return }
        let path = url.path.isEmpty || url.path == "/" ? "/index.html" : url.path
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            task.didFailWithError(URLError(.fileDoesNotExist)); return
        }
        let types = ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "json": "application/json", "wasm": "application/wasm",
                     "ttf": "font/ttf", "png": "image/png", "onnx": "application/octet-stream"]
        let headers = ["Content-Type": types[file.pathExtension.lowercased()] ?? "application/octet-stream", "Content-Length": String(data.count),
                       "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"]
        guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) else { task.didFailWithError(URLError(.unknown)); return }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
