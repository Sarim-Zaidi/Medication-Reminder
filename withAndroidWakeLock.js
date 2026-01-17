const { withAndroidManifest } = require('@expo/config-plugins');

const withAndroidWakeLock = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainActivity = androidManifest.manifest.application[0].activity.find(
      (activity) => activity.$['android:name'] === '.MainActivity'
    );

    if (mainActivity) {
      mainActivity.$['android:showWhenLocked'] = 'true';
      mainActivity.$['android:turnScreenOn'] = 'true';
      mainActivity.$['android:launchMode'] = 'singleTask';
    }

    return config;
  });
};

module.exports = withAndroidWakeLock;
