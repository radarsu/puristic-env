export interface PackageManifest {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}

// The extension stays dormant unless the workspace actually uses puristic: either a
// env.config.* file exists, or some package depends on an @puristic/* package.
export function usesPuristic(manifests: PackageManifest[], configFileIds: string[]): boolean {
    if (configFileIds.length > 0) {
        return true;
    }
    return manifests.some(hasPuristicDependency);
}

function hasPuristicDependency(manifest: PackageManifest): boolean {
    return [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies].some(
        (deps) => deps !== undefined && Object.keys(deps).some((name) => name.startsWith("@puristic/")),
    );
}
