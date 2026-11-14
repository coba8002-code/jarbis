// JARVIS 앱 만들기(Gradle 없이 안드로이드 SDK 도구만 사용). 결과: android/out/jarvis-debug.apk
// 필요: JDK(JAVA_HOME), 안드로이드 SDK(ANDROID_SDK: build-tools·platforms가 있는 폴더). SDK 폴더는 읽기만 한다.
// 사용(PowerShell): $env:ANDROID_SDK='D:\...\android-sdk'; node android/build.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
const sdk = process.env.ANDROID_SDK;
const javaHome = process.env.JAVA_HOME;
if (!sdk || !existsSync(join(sdk, 'build-tools'))) throw new Error('ANDROID_SDK에 build-tools가 있는 안드로이드 SDK 폴더를 적어 주세요.');
if (!javaHome || !existsSync(join(javaHome, 'bin'))) throw new Error('JAVA_HOME에 JDK 폴더를 적어 주세요.');

const newest = (dir, re) => readdirSync(dir).filter((d) => re.test(d)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
const bt = join(sdk, 'build-tools', newest(join(sdk, 'build-tools'), /^\d/));
const platform = join(sdk, 'platforms', process.env.ANDROID_PLATFORM ?? newest(join(sdk, 'platforms'), /^android-\d+$/));
const androidJar = join(platform, 'android.jar');
const win = process.platform === 'win32';
const tool = (name) => join(bt, win ? (name === 'aapt2' || name === 'zipalign' ? `${name}.exe` : `${name}.bat`) : name);
const jdk = (name) => join(javaHome, 'bin', win ? `${name}.exe` : name);
const env = { ...process.env, PATH: `${join(javaHome, 'bin')}${delimiter}${process.env.PATH}` };

function run(file, args, { quiet = false } = {}) {
  const bat = file.endsWith('.bat');
  // .bat은 cmd로 실행(경로에 빈칸이 없다는 것을 확인한 뒤)
  if (bat && [file, ...args].some((a) => /[\s&|<>^"]/.test(a))) throw new Error(`빈칸·특수 문자가 있는 경로는 쓸 수 없음: ${file}`);
  const res = execFileSync(bat ? 'cmd.exe' : file, bat ? ['/d', '/s', '/c', [file, ...args].join(' ')] : args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (!quiet && res.trim()) console.log(res.trim());
  return res;
}
const javaFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? javaFiles(join(dir, d.name)) : d.name.endsWith('.java') ? [join(dir, d.name)] : []));
const classFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? classFiles(join(dir, d.name)) : d.name.endsWith('.class') ? [join(dir, d.name)] : []));

rmSync(join(out, 'build'), { recursive: true, force: true });
mkdirSync(join(out, 'build', 'classes'), { recursive: true });
mkdirSync(join(out, 'build', 'dex'), { recursive: true });
console.log(`build-tools ${bt}\nplatform ${platform}`);

// 1) 매니페스트 → 기본 APK
const base = join(out, 'build', 'base.apk');
run(tool('aapt2'), ['link', '-I', androidJar, '--manifest', join(here, 'AndroidManifest.xml'), '--min-sdk-version', '24', '--target-sdk-version', '35', '-o', base]);
// 2) 자바 → class
run(jdk('javac'), ['-encoding', 'UTF-8', '-source', '11', '-target', '11', '-Xlint:-options', '-classpath', androidJar, '-d', join(out, 'build', 'classes'), ...javaFiles(join(here, 'src'))]);
// 3) class → dex
run(tool('d8'), ['--release', '--min-api', '24', '--lib', androidJar, '--output', join(out, 'build', 'dex'), ...classFiles(join(out, 'build', 'classes'))]);
// 4) dex 넣기(압축 없이) → 정렬 → 서명
const unsigned = join(out, 'build', 'unsigned.apk');
copyFileSync(base, unsigned);
run(jdk('jar'), ['--update', '--file', unsigned, '--no-compress', '--no-manifest', '-C', join(out, 'build', 'dex'), 'classes.dex']);
const aligned = join(out, 'build', 'aligned.apk');
run(tool('zipalign'), ['-f', '-p', '4', unsigned, aligned]);
const ks = join(out, 'debug.keystore');
if (!existsSync(ks)) {
  // 이 PC에서만 쓰는 시험용 서명 열쇠(GitHub에 올리지 않음). 앱을 다시 만들어도 같은 열쇠라 업데이트 설치가 된다.
  run(jdk('keytool'), ['-genkeypair', '-keystore', ks, '-storepass', 'jarvis-debug', '-keypass', 'jarvis-debug', '-alias', 'jarvis', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=JARVIS Debug'], { quiet: true });
}
const apk = join(out, 'jarvis-debug.apk');
run(tool('apksigner'), ['sign', '--ks', ks, '--ks-pass', 'pass:jarvis-debug', '--key-pass', 'pass:jarvis-debug', '--out', apk, aligned]);
run(tool('apksigner'), ['verify', '--min-sdk-version', '24', apk]);
const badging = run(tool('aapt2'), ['dump', 'badging', apk], { quiet: true }).split('\n').filter((l) => /^(package|sdkVersion|targetSdkVersion|uses-permission|launchable-activity)/.test(l));
console.log(badging.join('\n'));
console.log(`완료: ${apk} (${statSync(apk).size} 바이트)`);
