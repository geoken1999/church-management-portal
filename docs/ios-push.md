# Push notifications on iPhone

Push uses Firebase Cloud Messaging (FCM). On iPhone, FCM hands the message to Apple's push service (APNs), so Apple
and Firebase both need to be set up once.

## Already in the project

- Mobile app (`MobApps/kingdomflow_mobile`): `ios/Runner/Runner.entitlements` (push capability), the
  `remote-notification` background mode in `Info.plist`, and `GoogleService-Info.plist` bundled into the app.
- Server: iPhone messages ask for the default sound and immediate delivery (`src/lib/push/messages.ts`).
- Settings: Notifications in the app asks for permission after sign-in and registers the device token.

## What you do

1. **Apple Developer** (developer.apple.com → Certificates, Identifiers & Profiles)
   - Identifiers → the app id `com.nexora.kingdomflow` → turn on **Push Notifications** → Save.
   - Keys → add a key (+) → tick **Apple Push Notifications service (APNs)** → Download the `.p8` file once.
     Write down the **Key ID**, and your **Team ID** (top right of the Apple Developer page).
2. **Firebase Console** (project settings → Cloud Messaging → Apple app configuration)
   - The iOS app `com.nexora.kingdomflow` must be registered (its `GoogleService-Info.plist` is already in the project).
   - Under **APNs Authentication Key** → Upload the `.p8`, with the Key ID and Team ID.
3. **Xcode** (open `ios/Runner.xcworkspace`)
   - Runner → Signing & Capabilities: pick your Team, leave "Automatically manage signing" on. Push Notifications and
     Background Modes (Remote notifications) should be listed; if not, add them with **+ Capability**.
4. **Build and test on a real iPhone** (an Apple developer account is needed). Run it from Xcode, or archive for
   TestFlight. Sign in, allow notifications, then send one from the web (a church announcement). The device shows up in
   `device_push_tokens` with platform `ios`.

## If nothing arrives

- Super Admin → Logs shows push errors. `messaging/third-party-auth-error` means Firebase has no valid APNs key (step 2).
- A build uploaded to TestFlight/App Store uses Apple's **production** APNs; running from Xcode uses **sandbox**. A single
  APNs key works for both.
- Notifications are off for the app in iPhone Settings → Notifications → KingdomFlow.
