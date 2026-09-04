const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Confiança TLS no Android: a cadeia nova do Let's Encrypt (YE1 → ISRG Root
 * YE → X2) ainda não está no repositório de certificados de muitos aparelhos —
 * o navegador funciona (root store próprio do Chrome) e o app falhava o
 * handshake com "erro de conexão". Este plugin embute as âncoras públicas
 * ISRG Root YE e ISRG Root X2 junto do repositório do sistema.
 */
const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="@raw/isrg_root_ye" />
            <certificates src="@raw/isrg_root_x2" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

module.exports = function withNetworkSecurityConfig(config) {
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }
    return mod;
  });

  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const resDir = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      const xmlDir = path.join(resDir, 'xml');
      const rawDir = path.join(resDir, 'raw');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.mkdirSync(rawDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'network_security_config.xml'), NETWORK_SECURITY_CONFIG);
      const certsDir = path.join(mod.modRequest.projectRoot, 'plugins', 'certs');
      for (const name of ['isrg_root_ye.pem', 'isrg_root_x2.pem']) {
        fs.copyFileSync(path.join(certsDir, name), path.join(rawDir, name));
      }
      return mod;
    },
  ]);

  return config;
};
