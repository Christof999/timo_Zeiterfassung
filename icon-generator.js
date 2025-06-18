// Icon-Größen für verschiedene Plattformen optimieren
const iconSizes = [
    // Standard PWA Icons
    { size: 72, purpose: 'any' },
    { size: 96, purpose: 'any' },
    { size: 128, purpose: 'any' },
    { size: 144, purpose: 'any' },
    { size: 152, purpose: 'any' },
    { size: 192, purpose: 'any maskable' },
    { size: 384, purpose: 'any' },
    { size: 512, purpose: 'any maskable' },
    
    // iOS spezifische Größen
    { size: 120, purpose: 'any', platform: 'ios' },
    { size: 180, purpose: 'any', platform: 'ios' },
    
    // Android adaptive Icons
    { size: 192, purpose: 'maskable', platform: 'android' },
    { size: 512, purpose: 'maskable', platform: 'android' }
];

// Funktion zum Generieren von Icon-Definitionen für das Manifest
function generateIconsManifest(baseIconUrl) {
    return iconSizes.map(icon => ({
        src: baseIconUrl,
        sizes: `${icon.size}x${icon.size}`,
        type: 'image/png',
        purpose: icon.purpose
    }));
}

// Beispiel-Verwendung:
const manifestIcons = generateIconsManifest('https://anfragenmanager.s3.eu-central-1.amazonaws.com/Logo_Lauffer_RGB.png');
console.log('Generated manifest icons:', manifestIcons);

// Apple Touch Icons für bessere iOS-Unterstützung
const appleTouchIconSizes = [57, 60, 72, 76, 114, 120, 144, 152, 180];

function generateAppleTouchIconLinks(baseIconUrl) {
    return appleTouchIconSizes.map(size => 
        `<link rel="apple-touch-icon" sizes="${size}x${size}" href="${baseIconUrl}">`
    ).join('\n    ');
}

// Windows Tile Icons
const windowsTileSizes = [70, 150, 310];

function generateWindowsTileLinks(baseIconUrl) {
    return windowsTileSizes.map(size => 
        `<meta name="msapplication-square${size}x${size}logo" content="${baseIconUrl}">`
    ).join('\n    ');
}

// Export für Verwendung in anderen Dateien
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateIconsManifest,
        generateAppleTouchIconLinks,
        generateWindowsTileLinks,
        iconSizes
    };
}
