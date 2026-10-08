# RoadReady

A browser-based driver alertness monitor that uses a webcam to estimate eye closure and yawning, sounds a local alarm, and prepares an SMS or WhatsApp location alert for a trusted contact.

## Run locally

Camera and location permissions require a secure context. `localhost` is treated as secure by modern browsers.

1. Open a terminal in this folder.
2. Run `python -m http.server 8000`.
3. Open <http://localhost:8000> in a modern browser.
4. Choose **Start monitoring** and allow camera and location access.

An internet connection is needed to load MediaPipe and its face-landmark model from their CDNs. Camera frames are processed in the browser and are not uploaded by this app.

## Use

- Keep the app tab open and the camera view unobstructed while monitoring.
- A sustained eye closure or mouth opening triggers a repeating audible warning. Stop somewhere safe and rest; use **I'm awake — dismiss alarm** to silence it.
- Enter a trusted contact's phone number. Once GPS coordinates are available, **Share by SMS** opens the device's messaging app and **WhatsApp** opens a prefilled WhatsApp message. The driver must review and send it; the app does not send messages automatically.
- **Stop** ends camera and location access for the session.

This app is an assistive prototype, not a certified driver-safety device. Detection thresholds are approximate, and results vary with camera placement, lighting, and individual faces. It must not be used instead of adequate rest, safe driving practices, or emergency services.

## Publish on GitHub Pages

1. Push this project to a GitHub repository using the `main` or `master` branch.
2. In the repository, open **Settings → Pages** and set the build and deployment source to **GitHub Actions**.
3. The included Pages workflow deploys the site after each push. Check the **Actions** tab for the deployment status and open the published URL shown in the completed workflow.

The published site uses HTTPS, which is required for camera and location permissions outside `localhost`. Visitors still need to grant those permissions in their browser. The app processes camera frames in the browser and asks the visitor before opening an SMS or WhatsApp share.
