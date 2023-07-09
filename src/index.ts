import {spawn} from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import process from 'process';
import readline from 'readline/promises';
import axios from 'axios';
import extract from 'extract-zip';
import imageToBase64 from 'image-to-base64';
import {rimraf} from 'rimraf';
import {v4 as uuid4} from 'uuid';

const rl = readline.createInterface({
    input:process.stdin,
    output:process.stdout
});
const modPackDirPath = path.join(process.cwd(), 'modpacks')
const profileDirPath = path.join(process.cwd(), 'profiles')
const minecraftPath = path.join(process.env.APPDATA, '.minecraft')
const tempPath = path.join(os.tmpdir(), 'mc-modpack-installer')
const tempDirPath = path.join(tempPath, uuid4())
const java = path.join(tempDirPath, 'build-tools', 'jre', 'bin', 'java.exe')
const forgeCLI = path.join(tempDirPath, 'build-tools', 'ForgeCLI-1.0.1.jar')
const fabricInstaller = path.join(tempDirPath, 'build-tools', 'fabric-installer-0.11.2.jar')


interface ModpackConfigBase {
    type: 'MANUAL' | 'FORGE' | 'FABRIC' | 'VANILLA',
    versionId: string
    profileName: string
}
interface ModpackConfigManual extends ModpackConfigBase{
    type: 'MANUAL',
    manualMcVersion: string
}
interface ModpackConfigForge extends ModpackConfigBase{
    type: 'FORGE',
}
interface ModpackConfigVanilla extends ModpackConfigBase{
    type: 'VANILLA',
}
interface ModpackConfigFabric extends ModpackConfigBase{
    type: 'FABRIC',
    fabricMcVersion: string
    fabricLoaderVersion: string
}
type ModpackConfig = ModpackConfigManual | ModpackConfigForge | ModpackConfigFabric | ModpackConfigVanilla

async function run(dirName: string){
    await rimraf(tempPath)
    console.log('##########################################');
    console.log('');
    console.log('마인크래프트 모드팩 설치기');
    console.log('');
    console.log('##########################################');
    console.log('');

    await fsp.mkdir(modPackDirPath, {recursive: true})
    await fsp.mkdir(profileDirPath, {recursive: true})
    await extract(path.join(dirName, './buildTools.zip'), {dir: path.join(tempDirPath, 'build-tools')})

    const modpackFile = await selectModPack(modPackDirPath)
    const modpackPath = path.join(tempDirPath, 'modpack')
    console.log('선택한 모드팩 압축 해제중..');
    await extract(path.join(modPackDirPath, modpackFile), {dir: modpackPath})
    const modpackConfigBuf = await fsp.readFile(path.join(modpackPath, 'config.json'))
    const modpackConfig: ModpackConfig = JSON.parse(modpackConfigBuf.toString())
    console.log(`모드팩 ${modpackConfig.profileName} 설치 진행..`);

    if (modpackConfig.type === 'FABRIC') {
        await installFabric(modpackConfig.versionId, modpackConfig.fabricMcVersion, modpackConfig.fabricLoaderVersion)
    } else if (modpackConfig.type === 'FORGE') {
        await installForge(modpackConfig.versionId)

    } else if (modpackConfig.type === 'MANUAL') {
        await installModLoaderManual(modpackConfig.versionId, modpackConfig.manualMcVersion)
    } else if (modpackConfig.type === 'VANILLA') {
        console.log('Vanilla 설치 중..');
        console.log(`versionId: ${modpackConfig.versionId}`);
    } else {
        throw '알수없는 모드팩'
    }

    console.log('프로파일 설정 중..');
    const profileConfigPath = path.join(minecraftPath, 'launcher_profiles.json')
    const profileConfigBuf = await fsp.readFile(profileConfigPath)
    const profileConfig = JSON.parse(profileConfigBuf.toString())
    let profileNameIdx = 1;
    let fg = true
    while (fg) {
        fg = false
        for(const profileKey in profileConfig.profiles) {
            if (profileConfig.profiles[profileKey].name === modpackConfig.profileName + (profileNameIdx > 1 ? ` (${profileNameIdx})` : '')) {
                profileNameIdx++
                fg = true
                break
            }
        }
    }
    const profileName = modpackConfig.profileName + (profileNameIdx > 1 ? ` (${profileNameIdx})` : '')
    const profileDirName = profileName.replace(/[/\\]/g, '_').replace(/^\.+/, '_')
    const profileDirs = await fsp.readdir(profileDirPath)
    let profileDirIdx = 0

    fg = true
    while (fg) {
        if (profileDirs.indexOf(profileDirName  + (profileDirIdx > 0 ? `_${profileDirIdx}` : '')) >= 0) {
            profileDirIdx++
        } else {
            fg = false
        }
    }
    const gameDir = path.join(profileDirPath, profileDirName + (profileDirIdx > 0 ? `_${profileDirIdx}` : ''))

    const defaultImagePath = path.join(tempDirPath, 'build-tools', 'icon-default.png')
    const modpackImagePath = path.join(modpackPath, 'icon.png')
    let defaultImage = null;
    let modpackImage = null;
    try {
        defaultImage = await fsp.stat(defaultImagePath)
    } catch (e) {/* empty */}
    try {
        modpackImage = await fsp.stat(modpackImagePath)
    } catch (e) { /* empty */ }
    const curImagePath = modpackImage != null && modpackImage.isFile() ? modpackImagePath : defaultImage != null && defaultImage.isFile() ? defaultImagePath : null
    profileConfig.profiles = {
        ...profileConfig.profiles,
        [uuid4().replace(/-/g, '')] : {
            lastVersionId : modpackConfig.versionId,
            name : profileName,
            gameDir,
            type : 'custom',
            created : new Date().toISOString(),
            ...(curImagePath ? {icon: `data:image/png;base64,${await imageToBase64(curImagePath)}`} : {})
        }
    }
    console.log('프로파일 생성 중..');
    await fsp.writeFile(profileConfigPath, JSON.stringify(profileConfig));
    console.log('프로파일 초기화 중..');
    await extract(path.join(modpackPath, 'init.zip'), {dir: gameDir})
    console.log('');
    console.log('##########################################');
    console.log('');

    console.log(`프로파일 명: ${profileName}`);
    console.log(`프로파일 설치 경로 ${gameDir}`);
    console.log('설치 완료!');
}

async function installFabric(versionId: string, mcVersion: string, loaderVersion: string) {
    console.log('Fabric 설치 중..');
    console.log(`versionId: ${versionId}, mcVersion: ${mcVersion}, loaderVersion: ${loaderVersion}`);
    await runJava('-jar', fabricInstaller, 'client', '-snapshot', '-noprofile', '-dir', minecraftPath, '-mcversion', mcVersion, '-loader', loaderVersion)
}
async function installForge(versionId: string) {
    console.log('Forge( 설치 중..');
    console.log(`versionId: ${versionId}`);
    await runJava('-jar', forgeCLI, '--installer', path.join(tempDirPath, 'modpack', 'forge-installer.jar'), '--target', minecraftPath)
}
async function installModLoaderManual(versionId: string, mcVersion: string) {
    console.log('ModLoader 설치 중..');
    console.log(`versionId: ${versionId}, mcVersion: ${mcVersion}`);
    await fsp.mkdir(path.join(minecraftPath, 'versions', versionId), {recursive: true})
    await fsp.mkdir(path.join(minecraftPath, 'libraries'), {recursive: true})

    const manifestPath = path.join(minecraftPath, 'versions', 'version_manifest_v2.json')
    const manifestBuf = await fsp.readFile(manifestPath)
    const manifest = JSON.parse(manifestBuf.toString())
    const curVersion = manifest.versions.find(item => item.id === mcVersion)

    const response = await axios.get(curVersion.url);
    const versionMetadata: any = response.data;
    await download(versionMetadata.downloads.client.url, path.join(minecraftPath, 'versions', versionId, `${versionId}.jar`));

    await fsp.copyFile(path.join(tempDirPath, 'modpack', 'version.json'), path.join(minecraftPath, 'versions', versionId, `${versionId}.json`))
    await extract(path.join(tempDirPath, 'modpack', 'libraries.zip'), {dir: path.join(minecraftPath, 'libraries')})
}

async function selectModPack(modPackPath) : Promise<string>{
    const filenames = (await fsp.readdir(modPackPath, {withFileTypes: true})).filter(file => file.name.toLowerCase().endsWith('.zip')).map(file => file.name)
    console.log('');
    if (filenames.length) {
        for(const i in filenames){
            console.log(`  ${parseInt(i)+1}: ${filenames[i]}`);
        }
        console.log('');
        const i = parseInt(await rl.question(`설치할 모드팩을 선택해 주세요. (1 ~ ${filenames.length}) : `));
        if (isNaN(i) || i < 1 || i > filenames.length) {
            console.log('잘못된 입력입니다.');
            return await selectModPack(modPackPath);
        }
        return filenames[i-1]
    } else {
        await rl.question('확인되는 모드팩 파일이 존재하지 않습니다. (엔터를 눌러 다시 확인)')
        return await selectModPack(modPackPath);
    }

}

async function runJava(...args: string[]) {
    return new Promise<void>((resolve, reject) => {
        const stream = spawn(java, args)
        stream.stdout.on('data', function(data) {
            console.log(data.toString());
        });

        stream.stderr.on('data', function(data) {
            console.error(data.toString());
        });

        stream.on('exit', function(code) {
            if (code === 0) {
                resolve()
            } else {
                reject()
            }
        });
    })
}

async function download(url, path) {
    const fileStream = fs.createWriteStream(path);
    const res = await axios.get(url, {responseType: 'stream'});
    await new Promise<void>((resolve, reject) => {
        res.data.pipe(fileStream);
        let error = null;
        fileStream.on('error', (err) => {
            error = err;
            fileStream.close();
            reject(err);
        });
        fileStream.on('finish', function() {
            if (!error) {
                resolve();
            }
        });
    });
}

export async function start(dirName){
    try {
        await run(dirName)
    } catch (e) {
        console.error(e)
    }finally {
        console.log('종료하려면 아무 키나 누르세요.')
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', process.exit.bind(process, 0));
    }
}
