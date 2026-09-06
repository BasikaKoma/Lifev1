/**
 * After `npx cap add ios` / `npx cap sync ios`, ensure Info.plist has
 * Bluetooth, microphone, and the Oura deep-link scheme.
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const plistPath = path.join(projectRoot, 'ios', 'App', 'App', 'Info.plist');

const ENTRIES = [
  {
    key: 'NSBluetoothAlwaysUsageDescription',
    xml: `	<key>NSBluetoothAlwaysUsageDescription</key>
	<string>lifev1 uses Bluetooth to connect to your QN-Scale and save weight readings.</string>`,
  },
  {
    key: 'NSBluetoothPeripheralUsageDescription',
    xml: `	<key>NSBluetoothPeripheralUsageDescription</key>
	<string>lifev1 uses Bluetooth to connect to your QN-Scale and save weight readings.</string>`,
  },
  {
    key: 'NSMicrophoneUsageDescription',
    xml: `	<key>NSMicrophoneUsageDescription</key>
	<string>lifev1 uses the microphone for voice notes and the assistant.</string>`,
  },
];

const URL_TYPES = `	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>com.lifev1.app</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>lifev1</string>
			</array>
		</dict>
	</array>`;

function insertBeforeDictClose(plist, block) {
  const close = plist.lastIndexOf('</dict>');
  if (close < 0) throw new Error('Could not find closing </dict> in Info.plist');
  return `${plist.slice(0, close)}${block}\n${plist.slice(close)}`;
}

function patch() {
  if (!fs.existsSync(plistPath)) {
    console.log('No ios/App/App/Info.plist yet — skip (run npx cap add ios on a Mac).');
    return;
  }

  let plist = fs.readFileSync(plistPath, 'utf8');
  let changed = false;

  for (const entry of ENTRIES) {
    if (plist.includes(`<key>${entry.key}</key>`)) continue;
    plist = insertBeforeDictClose(plist, entry.xml);
    changed = true;
    console.log(`Added ${entry.key}`);
  }

  if (!plist.includes('<string>lifev1</string>')) {
    plist = insertBeforeDictClose(plist, URL_TYPES);
    changed = true;
    console.log('Added CFBundleURLTypes lifev1://');
  }

  if (!changed) {
    console.log('iOS Info.plist already has Bluetooth, microphone, and URL scheme.');
    return;
  }

  fs.writeFileSync(plistPath, plist);
  console.log(`Patched ${plistPath}`);
}

patch();
