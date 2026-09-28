import { CapacitorConfig } from '@capacitor/cli';

// The Android shell is a WebView wrapper. `server.url` points the WebView at
// the hosted app (which provides Clerk sign-in + the /api routes).
//   production:       CAP_APP_URL=https://contacts.dentaldiamondhn.com npm run cap:sync
//   local dev:        CAP_APP_URL=http://10.0.2.2:3000 npm run cap:sync
const appUrl = process.env.CAP_APP_URL ?? 'https://contacts.dentaldiamondhn.com';

const config: CapacitorConfig = {
  appId: 'com.diamondlink.contacts',
  appName: 'Diamond Contacts',
  webDir: 'out',
  server: {
    url: appUrl,
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['*']
  }
};

export default config;