const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const withFmtFix = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      if (!fs.existsSync(podfilePath)) return config;

      let content = fs.readFileSync(podfilePath, "utf-8");
      if (content.includes("FMT_USE_CONSTEVAL")) return config;

      const patch = `
  installer.pods_project.targets.each do |target|
    if target.name == 'fmt' || target.name == 'RCT-Folly'
      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_USE_CONSTEVAL=0'
      end
    end
  end`;

      content = content.replace(
        /post_install do \|installer\|/,
        `post_install do |installer|\n${patch}`
      );
      fs.writeFileSync(podfilePath, content);
      return config;
    },
  ]);
};

module.exports = withFmtFix;