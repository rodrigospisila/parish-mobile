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

// Certificados PUBLICOS (ancoras) embutidos: *.pem esta no .gitignore e o EAS
// so envia o que o git rastreia — arquivos soltos quebravam o prebuild na nuvem
const CERTS = {
  'isrg_root_ye.pem': `-----BEGIN CERTIFICATE-----
MIICpjCCAiugAwIBAgIRAIchZfw0tuX7qK3Vs3BftTowCgYIKoZIzj0EAwMwTzEL
MAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2VhcmNo
IEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDIwHhcNMjYwNTEzMDAwMDAwWhcN
MzIwOTAyMjM1OTU5WjAuMQswCQYDVQQGEwJVUzENMAsGA1UEChMESVNSRzEQMA4G
A1UEAxMHUm9vdCBZRTB2MBAGByqGSM49AgEGBSuBBAAiA2IABDwS/6vhrcVqcbBo
+wgdI3fwn9x7DNJJOY/lTOti0vkwuRN87RhEhTH17E7XyFjWsPYhIPt/wzOqxTd2
b+4ZJNy9ID04YywF9U5zasDVyGSNErVNtz8uSGh5izW87j77GaOB6zCB6DAOBgNV
HQ8BAf8EBAMCAQYwEwYDVR0lBAwwCgYIKwYBBQUHAwEwDwYDVR0TAQH/BAUwAwEB
/zAdBgNVHQ4EFgQUo8gmWo6hTNA1Y/ybI8g6rlbzT1YwHwYDVR0jBBgwFoAUfEKW
rt5LSDv6kviejM9ti6lyN5UwMgYIKwYBBQUHAQEEJjAkMCIGCCsGAQUFBzAChhZo
dHRwOi8veDIuaS5sZW5jci5vcmcvMBMGA1UdIAQMMAowCAYGZ4EMAQIBMCcGA1Ud
HwQgMB4wHKAaoBiGFmh0dHA6Ly94Mi5jLmxlbmNyLm9yZy8wCgYIKoZIzj0EAwMD
aQAwZgIxAMU19WCtmxVND8UHBZRoma49Z7jPs64Dma0eTu1OChVbB/2J7GV3nvYK
Ax54uk1G9QIxAO0miLVJu8PLNiXXXkiE/gsK3CTRTF/aeo4bMX42Zw40csRU6AC2
6hSW1/IWaas6dg==
-----END CERTIFICATE-----
`,
  'isrg_root_x2.pem': `-----BEGIN CERTIFICATE-----
MIIEcDCCAligAwIBAgIQbI8dxyfHEX97r4U6yYD5zTANBgkqhkiG9w0BAQsFADBP
MQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFy
Y2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMTAeFw0yNjA1MTMwMDAwMDBa
Fw0zMjA5MDIyMzU5NTlaME8xCzAJBgNVBAYTAlVTMSkwJwYDVQQKEyBJbnRlcm5l
dCBTZWN1cml0eSBSZXNlYXJjaCBHcm91cDEVMBMGA1UEAxMMSVNSRyBSb290IFgy
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEzZvVn4CDCuwJSvMWSj5cz3es3mcFDR0H
ttwW+1qLFNvicWDEukWVEYmO6gbf9yoWHKS5xcUy4APgHoIYOIvXRdgKam7mAHf7
AlF9ItgKbppbd9/w+kHsOdx1ymgHDB/qo4H1MIHyMA4GA1UdDwEB/wQEAwIBBjAd
BgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDwYDVR0TAQH/BAUwAwEB/zAd
BgNVHQ4EFgQUfEKWrt5LSDv6kviejM9ti6lyN5UwHwYDVR0jBBgwFoAUebRZ5nu2
5eQBc4AIiMgaWPbpm24wMgYIKwYBBQUHAQEEJjAkMCIGCCsGAQUFBzAChhZodHRw
Oi8veDEuaS5sZW5jci5vcmcvMBMGA1UdIAQMMAowCAYGZ4EMAQIBMCcGA1UdHwQg
MB4wHKAaoBiGFmh0dHA6Ly94MS5jLmxlbmNyLm9yZy8wDQYJKoZIhvcNAQELBQAD
ggIBAD2/e9frmMxNpCV03qUHegg+MV2wz9644YoXdqtH8RyWYcBO7xfjjGEXdU1e
/o0OkEFiynUCOSIk/vLLo7ttz6CPAeNlWfC0XNkoGeWgK6jjXvozBaGuGH5n0Ufo
shMeWTuURqNN5G00sSXDTBrpp2+mgvdZQjb8K11TYMA25QA+YHNfbIEL0BniAhKS
2gsnJjSzrdZLI+EZ7SEyqdR2rkjd1KutLDU+n3TFyxjniZVGur4YlhMP3mY/dV95
IruAkkjOZier6hGBdEgZXXvaCz9u9iVEadsIE75pAGL8oHV5vxdARDiotRpul1IN
/UZwzAbrfUFcw1HkAcYD/mlZfnQ2ieCF2MS7j3Vhv7JPDKp45fmykmzYNSrumRW0
upFFKDBOoF7hsOb7oLyHS+Uft6jOUfOrogj8YUx38hKb2K20r42OgsSdDdxdeYWc
MS3Sb6mwJeSZEYxJ2gaXnDSPaKhhrNkYwljyVQyr4Nq+MEJytXNTnHqaAcrNwZlV
pcJL1KBnMrMjP7eanvUwL3FYj3cF17jtboLt7gLoi4+2rWZFvn+w54jmd/FIuhhZ
cEaU/wvU6BUNMtcVquVGHp7itQeDth5j+XL3j4WJ2SABwzUl6OeYdgpIt/ITZa+p
TT0mQ/r5XyA4MEAiabn7XJjvCERlF2dcn2wqJw+CreTkkQ2R
-----END CERTIFICATE-----
`,
};

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
      for (const [name, pem] of Object.entries(CERTS)) {
        fs.writeFileSync(path.join(rawDir, name), pem);
      }
      return mod;
    },
  ]);

  return config;
};
