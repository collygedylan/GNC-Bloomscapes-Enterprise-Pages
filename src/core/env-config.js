(function (root) {
    const hostname = root.location.hostname.toLowerCase();
    const bloomscapesProjectRef = 'ozuligoikpyzgnmeccrw';
    const donorProjectRef = 'kzrnyjsosryejjejliii';
    const approved = new Set(['bloomscapes.app', 'www.bloomscapes.app',
        'localhost', '127.0.0.1', '[::1]', 'collygedylan.github.io']);
    const allowedOrigin = approved.has(hostname);
    Object.defineProperty(root, 'GncBloomscapesEnvironment', {
        value: Object.freeze({
            enabled: allowedOrigin,
            projectRef: bloomscapesProjectRef,
            supabaseHostname: allowedOrigin ? bloomscapesProjectRef + '.supabase.co' : '',
            supabaseUrl: allowedOrigin ? 'https://' + bloomscapesProjectRef + '.supabase.co' : root.location.origin,
            publishableKey: 'sb_publishable_RLKtJFn5X7YlCaFS3RbUqw_dcrgDrwt',
            authStorageKey: 'sb-' + bloomscapesProjectRef + '-auth-token',
            donorProjectByHostname: Object.freeze({
                'agmetricapp.com': donorProjectRef,
                'www.agmetricapp.com': donorProjectRef
            })
        })
    });
})(globalThis);

window.guardRememberedSessionBeforePaint = function () {
    if (window.hasAgDataRememberedSession()) {
        window.__agdataDisarmBootGuards();
        document.documentElement.classList.add('agdata-retained-prepaint', 'agdata-authenticated-boot');
    }
};
