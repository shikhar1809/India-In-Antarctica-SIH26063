/// Where the portal lives. These are the Firebase project's *client*
/// identifiers — public by design: they name the project, and the portal's
/// security rules decide what any client may read or write.
///
/// The app talks to Firebase over its plain HTTPS APIs (see
/// services/portal_api.dart), not through the Firebase SDK, so the same code
/// runs on Windows and Android and nothing needs registering per platform.
class PortalConfig {
  static const apiKey = 'AIzaSyDWQBa6t_8isKi3pKOddTYp3fUrDm5lD-0';
  static const projectId = 'indiainantartica';
  static const bucket = 'indiainantartica.firebasestorage.app';
}
