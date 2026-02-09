import { TAbstractFile, TFile, TFolder, Notice } from 'obsidian';
import React, { useEffect } from 'react';
import { FileComponent } from 'components/FileView/FileComponent';
import { MainFolder } from 'components/FolderView/MainFolder';
import { SingleViewVertical, SingleViewHorizontal } from 'components/MainView/SingleView';
import { FileTreeView } from 'FileTreeView';
import FileTreeAlternativePlugin from 'main';
import * as FileTreeUtils from 'utils/Utils';
import * as recoilState from 'recoil/pluginState';
import { useRecoilState } from 'recoil';
import useForceUpdate from 'hooks/ForceUpdate';
import { CustomVaultChangeEvent, VaultChange, eventTypes, OZFile } from 'utils/types';

interface MainTreeComponentProps {
    fileTreeView: FileTreeView;
    plugin: FileTreeAlternativePlugin;
}

export default function MainTreeComponent(props: MainTreeComponentProps) {
    // --> Main Variables
    const { plugin } = props;

    // --> Force Update Hook
    const forceUpdate = useForceUpdate();

    // --> Plugin States
    const [view, setView] = useRecoilState(recoilState.view);
    const [activeFolderPath, setActiveFolderPath] = useRecoilState(recoilState.activeFolderPath);
    const [ozFileList, setOzFileList] = useRecoilState(recoilState.ozFileList);
    const [ozPinnedFiles, setOzPinnedFiles] = useRecoilState(recoilState.ozPinnedFileList);
    const [openFolders, setOpenFolders] = useRecoilState(recoilState.openFolders);
    const [_folderTree, setFolderTree] = useRecoilState(recoilState.folderTree);
    const [excludedFolders, setExcludedFolders] = useRecoilState(recoilState.excludedFolders);
    const [_folderFileCountMap, setFolderFileCountMap] = useRecoilState(recoilState.folderFileCountMap);
    const [excludedExtensions, setExcludedExtensions] = useRecoilState(recoilState.excludedExtensions);
    const [_showSubFolders, setShowSubFolders] = useRecoilState(recoilState.showSubFolders);
    const [focusedFolder, setFocusedFolder] = useRecoilState(recoilState.focusedFolder);
    const [activeOZFile, setActiveOzFile] = useRecoilState(recoilState.activeOZFile);

    const setNewFileList = (folderPath?: string) => {
        let filesPath = folderPath ? folderPath : activeFolderPath;
        setOzFileList(
            FileTreeUtils.getFilesUnderPath({
                path: filesPath,
                plugin: plugin,
                excludedExtensions: excludedExtensions,
                excludedFolders: excludedFolders,
            })
        );
    };

    const setInitialActiveFolderPath = () => {
        if (['Horizontal', 'Vertical'].includes(plugin.settings.evernoteView)) {
            let previousActiveFolder = localStorage.getItem(plugin.keys.activeFolderPathKey);
            if (previousActiveFolder) {
                let folder = plugin.app.vault.getAbstractFileByPath(previousActiveFolder);
                if (folder && folder instanceof TFolder) {
                    setActiveFolderPath(folder.path);
                }
            }
        }
    };

    // --> Create Custom Event Handlers
    useEffect(() => {
        window.addEventListener(eventTypes.vaultChange, vaultChangeEvent);
        window.addEventListener(eventTypes.activeFileChange, changeActiveFile);
        window.addEventListener(eventTypes.refreshView, forceUpdate);
        window.addEventListener(eventTypes.revealFile, handleRevealFileEvent);
        window.addEventListener(eventTypes.revealFolder, handleRevealFolderEvent);
        window.addEventListener(eventTypes.createNewNote, handleCreateNewNoteEvent);
        return () => {
            window.removeEventListener(eventTypes.vaultChange, vaultChangeEvent);
            window.removeEventListener(eventTypes.activeFileChange, changeActiveFile);
            window.removeEventListener(eventTypes.refreshView, forceUpdate);
            window.removeEventListener(eventTypes.revealFile, handleRevealFileEvent);
            window.removeEventListener(eventTypes.revealFolder, handleRevealFolderEvent);
            window.removeEventListener(eventTypes.createNewNote, handleCreateNewNoteEvent);
        };
    }, []);

    const handleCreateNewNoteEvent = () => {
        let currentActiveFolderPath = '/';
        setActiveFolderPath((activeFolderPath) => {
            currentActiveFolderPath = activeFolderPath;
            return activeFolderPath;
        });
        FileTreeUtils.createNewFile(null, currentActiveFolderPath, plugin);
    };

    const vaultChangeEvent = (evt: CustomVaultChangeEvent) => {
        handleVaultChanges(evt.detail.file, evt.detail.changeType, evt.detail.oldPath);
    };

    const changeActiveFile = (evt: Event) => {
        // @ts-ignore
        let filePath: string = evt.detail.filePath;
        let file = plugin.app.vault.getAbstractFileByPath(filePath);
        if (file) setActiveOzFile(FileTreeUtils.TFile2OZFile(file as TFile));
    };

    // Initial Load
    useEffect(() => {
        setInitialFocusedFolder();
        setExcludedFolders(getExcludedFolders());
        setExcludedExtensions(getExcludedExtensions());
        setOzPinnedFiles(getPinnedFilesFromSettings());
        setOpenFolders(getOpenFoldersFromSettings());
        setShowSubFolders(plugin.settings.showFilesFromSubFolders);
        setInitialActiveFolderPath();
        if (plugin.settings.folderCount) setFolderFileCountMap(FileTreeUtils.getFolderNoteCountMap(plugin));
    }, []);

    // Each Focused Folder Change triggers new folder tree build
    useEffect(() => {
        if (focusedFolder) {
            setFolderTree(
                FileTreeUtils.createFolderTree({
                    startFolder: focusedFolder,
                    plugin: plugin,
                    excludedFolders: excludedFolders,
                })
            );
            localStorage.setItem(plugin.keys.focusedFolder, focusedFolder.path);
        }
    }, [focusedFolder, excludedFolders]);

    const setInitialFocusedFolder = () => {
        let localFocusedFolder = localStorage.getItem(plugin.keys.focusedFolder);
        if (localFocusedFolder) {
            let folder = plugin.app.vault.getAbstractFileByPath(localFocusedFolder);
            if (folder && folder instanceof TFolder) {
                setFocusedFolder(folder);
                return;
            }
        }
        setFocusedFolder(plugin.app.vault.getRoot());
    };

    // State Change Handlers
    useEffect(() => savePinnedFilesToSettings(), [ozPinnedFiles]);
    useEffect(() => saveOpenFoldersToSettings(), [openFolders]);
    useEffect(() => saveExcludedFoldersToSettings(), [excludedFolders]);

    // If activeFolderPath is set, it means it should go to 'file' view
    useEffect(() => {
        if (activeFolderPath !== '') {
            setNewFileList(activeFolderPath);
            setView('file');
        }
        localStorage.setItem(plugin.keys.activeFolderPathKey, activeFolderPath);
    }, [activeFolderPath]);

    // Load Excluded Extensions as State
    function getExcludedExtensions(): string[] {
        let extensionsString: string = plugin.settings.excludedExtensions;
        let excludedExtensions: string[] = [];
        for (let extension of extensionsString.split(',')) {
            excludedExtensions.push(extension.trim());
        }
        return excludedExtensions;
    }

    // Load Excluded Folders
    function getExcludedFolders(): string[] {
        let excludedString: string = plugin.settings.excludedFolders;
        let excludedFolders: string[] = [];
        if (excludedString) {
            for (let excludedFolder of excludedString.split(',')) {
                if (excludedFolder !== '') excludedFolders.push(excludedFolder.trim());
            }
        }
        return excludedFolders;
    }

    // Load The String List and Set Open Folders State
    function getOpenFoldersFromSettings(): string[] {
        let openFolders: string[] = [];
        let localStorageOpenFolders = localStorage.getItem(plugin.keys.openFoldersKey);
        if (localStorageOpenFolders) {
            localStorageOpenFolders = JSON.parse(localStorageOpenFolders);
            for (let folder of localStorageOpenFolders) {
                let openFolder = plugin.app.vault.getAbstractFileByPath(folder);
                if (openFolder) openFolders.push(openFolder.path);
            }
        }
        return openFolders;
    }

    // Load The String List anad Set Pinned Files State
    function getPinnedFilesFromSettings(): OZFile[] {
        let pinnedFiles: OZFile[] = [];
        let localStoragePinnedFiles = localStorage.getItem(plugin.keys.pinnedFilesKey);
        if (localStoragePinnedFiles) {
            localStoragePinnedFiles = JSON.parse(localStoragePinnedFiles);
            for (let file of localStoragePinnedFiles) {
                let pinnedFile = plugin.app.vault.getAbstractFileByPath(file) as TFile;
                if (pinnedFile) pinnedFiles.push(FileTreeUtils.TFile2OZFile(pinnedFile));
            }
        }
        return pinnedFiles;
    }

    // Get The Folders State and Save in Data as String Array
    function saveOpenFoldersToSettings() {
        let openFoldersToSave: string[] = [];
        for (let folder of openFolders) {
            openFoldersToSave.push(folder);
        }
        localStorage.setItem(plugin.keys.openFoldersKey, JSON.stringify(openFoldersToSave));
    }

    // Get The Pinned Files State and Save in Data as String Array
    function savePinnedFilesToSettings() {
        let pinnedFilesToSave: string[] = [];
        for (let file of ozPinnedFiles) {
            pinnedFilesToSave.push(file.path);
        }
        localStorage.setItem(plugin.keys.pinnedFilesKey, JSON.stringify(pinnedFilesToSave));
    }

    // Save Excluded Folders to Settings as String
    function saveExcludedFoldersToSettings() {
        plugin.settings.excludedFolders = excludedFolders.length > 1 ? excludedFolders.join(', ') : excludedFolders[0];
        plugin.saveSettings();
    }

    // Function for Event Handlers
    function handleVaultChanges(file: TAbstractFile, changeType: VaultChange, oldPathBeforeRename?: string) {
        // Get Current States from Setters
        let currentActiveFolderPath: string = '';

        setActiveFolderPath((activeFolderPath) => {
            currentActiveFolderPath = activeFolderPath;
            return activeFolderPath;
        });

        // File Event Handlers
        if (file instanceof TFile) {
            // Update Pinned Files
            if (['rename', 'delete'].contains(changeType)) {
                let currentOzPinnedFiles: OZFile[] = [];
                setOzPinnedFiles((ozPinnedFiles) => {
                    currentOzPinnedFiles = ozPinnedFiles;
                    return ozPinnedFiles;
                });
                const filteredPinnedFiles: OZFile[] = currentOzPinnedFiles.filter(
                    (f) => f.path !== (changeType === 'rename' ? oldPathBeforeRename : file.path)
                );
                if (filteredPinnedFiles.length !== currentOzPinnedFiles.length) {
                    setOzPinnedFiles([...filteredPinnedFiles, ...(changeType === 'rename' ? [FileTreeUtils.TFile2OZFile(file)] : [])]);
                }
            }
            // Update current View
            let currentView: string = '';
            setView((view) => {
                currentView = view;
                return view;
            });
            if (currentView === 'file') {
                let currentFileList: OZFile[] = [];
                setOzFileList((fileList) => {
                    currentFileList = fileList;
                    return fileList;
                });
                // Evaluate changes
                if (changeType === 'rename' || changeType === 'modify' || changeType === 'delete') {
                    // If the file is modified but sorting is not last-update to not component update unnecessarily, return
                    let sortFilesBy = plugin.settings.sortFilesBy;
                    if (changeType === 'modify') {
                        if (!(sortFilesBy === 'last-update' || sortFilesBy === 'file-size')) {
                            return;
                        }
                    }
                    // If the file renamed or deleted or modified is in the current view, it will be updated
                    let parentFolderPath = file.path.substring(0, file.path.lastIndexOf('/'));
                    let fileInCurrentView = currentFileList.some((f) => {
                        return changeType === 'rename' ? f.path === oldPathBeforeRename : f.path === file.path;
                    });
                    let fileInCurrentFolder =
                        currentActiveFolderPath === parentFolderPath ||
                        (plugin.settings.showFilesFromSubFolders && parentFolderPath.startsWith(currentActiveFolderPath));
                    if (fileInCurrentView) {
                        if (changeType === 'delete') {
                            setOzFileList(
                                currentFileList.filter((f) => {
                                    return f.path !== file.path;
                                })
                            );
                        } else if (
                            changeType === 'rename' ||
                            (changeType === 'modify' && (sortFilesBy === 'last-update' || sortFilesBy === 'file-size'))
                        ) {
                            // Fix for Root Folder Path
                            if (currentActiveFolderPath === '/') currentActiveFolderPath = '';
                            // Set the file list
                            setOzFileList([
                                ...currentFileList.filter((f) => {
                                    return changeType === 'rename' ? f.path !== oldPathBeforeRename : f.path !== file.path;
                                }),
                                // Include any file that roles up to the current active folder, not only the direct ones
                                ...(file.parent.path.startsWith(currentActiveFolderPath) ? [FileTreeUtils.TFile2OZFile(file)] : []),
                            ]);
                            // If active file is renamed, change the active file
                            let currentActiveOZFile: OZFile = null;
                            setActiveOzFile((activeOZFile) => {
                                currentActiveOZFile = activeOZFile;
                                return activeOZFile;
                            });
                            if (changeType === 'rename' && currentActiveOZFile && currentActiveOZFile.path === oldPathBeforeRename) {
                                setActiveOzFile(FileTreeUtils.TFile2OZFile(file));
                            }
                        }
                    }
                    // File is no in current view but parent folder is and should be included
                    else if (fileInCurrentFolder && !fileInCurrentView) {
                        setOzFileList([...currentFileList, FileTreeUtils.TFile2OZFile(file)]);
                    }
                } else if (changeType === 'create') {
                    let fileIsCreatedUnderActiveFolder = file.path.match(new RegExp(currentActiveFolderPath + '.*'));
                    if (fileIsCreatedUnderActiveFolder) {
                        // If file is not already in the list, add into view
                        if (!currentFileList.some((f) => f.path === file.path)) {
                            setOzFileList([...currentFileList, FileTreeUtils.TFile2OZFile(file)]);
                        }
                    }
                }
            }
        }

        // Folder Event Handlers
        else if (file instanceof TFolder) {
            let currentFocusedFolder: TFolder = null;
            setFocusedFolder((focusedFolder) => {
                currentFocusedFolder = focusedFolder;
                return focusedFolder;
            });
            setFolderTree(FileTreeUtils.createFolderTree({ startFolder: currentFocusedFolder, plugin: plugin, excludedFolders: excludedFolders }));
            // if active folder is renamed, activefolderpath needs to be refreshed
            if (changeType === 'rename' && oldPathBeforeRename && currentActiveFolderPath === oldPathBeforeRename) {
                setActiveFolderPath(file.path);
            }
        }

        // After Each Vault Change Folder Count Map to Be Updated
        if (plugin.settings.folderCount && changeType !== 'modify') {
            setFolderFileCountMap(FileTreeUtils.getFolderNoteCountMap(plugin));
        }
    }

    // ******** REVEAL ACTIVE FILE FUNCTIONS ******** //
    // --> During file list change, it will scroll to the active file element
    useEffect(() => {
        if (activeOZFile && ozFileList.length > 0) scrollToFile(activeOZFile);
    }, [ozFileList]);

    // Custom Event Handler Function
    async function handleRevealFileEvent(evt: Event) {
        // @ts-ignore
        const file: TFile = evt.detail.file;
        if (file && file instanceof TFile) {
            await plugin.openFileTreeLeaf(true);
            revealFileInFileTree(FileTreeUtils.TFile2OZFile(file));
        } else {
            new Notice('File not found');
        }
    }

    function handleRevealFolderEvent(evt: Event) {
        // @ts-ignore
        const folder: TFolder = evt.detail.folder;
        if (folder && folder instanceof TFolder) {
            revealFolderInFileTree(folder);
        } else {
            new Notice('Folder not found');
        }
    }

    // Scrolling Functions
    function scrollToFile(fileToScroll: OZFile) {
        const selector = `div.oz-file-tree-files div.oz-nav-file-title[data-path="${fileToScroll.path}"]`;
        const fileTitleElement = document.querySelector(selector);
        if (fileTitleElement) fileTitleElement.scrollIntoView(false);
    }

    function scrollToFolder(folder: TFolder) {
        const selector = `div.oz-folder-contents div.oz-folder-element[data-path="${folder.path}"]`;
        const folderElement = document.querySelector(selector);
        if (folderElement) folderElement.scrollIntoView(false);
    }

    // Helper for Reveal Button: Obtain all folders that needs to be opened
    const getAllFoldersToOpen = (fileToReveal: TFile | TFolder) => {
        let foldersToOpen: string[] = [];
        const recursiveFx = (folder: TFolder) => {
            foldersToOpen.push(folder.path);
            if (folder.parent) recursiveFx(folder.parent);
        };
        recursiveFx(fileToReveal instanceof TFile ? fileToReveal.parent : fileToReveal);
        return foldersToOpen;
    };

    // --> Handle Reveal Folder Button
    function revealFolderInFileTree(folderToReveal: TFolder) {
        if (!folderToReveal) return;
        setActiveFolderPath(folderToReveal.path);
        const foldersToOpen = getAllFoldersToOpen(folderToReveal);
        let openFoldersSet = new Set([...openFolders, ...foldersToOpen]);
        setOpenFolders(Array.from(openFoldersSet));
        scrollToFolder(folderToReveal);
    }

    // --> Handle Reveal Active File Button
    function revealFileInFileTree(ozFileToReveal: OZFile) {
        const fileToReveal = plugin.app.vault.getAbstractFileByPath(ozFileToReveal.path) as TFile;
        if (!fileToReveal) return;

        // 1. 获取直接父文件夹 (例如: A/B/C.md -> 获取 B)
        const parentFolder = fileToReveal.parent;

        // 2. 【核心修改】尝试获取"爷爷"文件夹 (例如: 获取 A)
        // 如果 parentFolder 是根目录，它的 parent 是 null，这时候我们就兜底使用 parentFolder 自身
        const grandParentFolder = parentFolder.parent ? parentFolder.parent : parentFolder;

        // Sanity check - Parent to be folder and set required component states
        if (parentFolder instanceof TFolder) {
            
            // 3. 聚焦逻辑：我们要聚焦的是"爷爷" (grandParentFolder)
            if (!focusedFolder || focusedFolder.path !== grandParentFolder.path) {
                setFocusedFolder(grandParentFolder);
            }

            // Set Active Folder - 这里依然设置为直接父文件夹(B)，因为我们希望文件列表展示的是 C.md 所在的那一层
            setActiveFolderPath(parentFolder.path);

            // Set active file to show in the list
            setActiveOzFile(FileTreeUtils.TFile2OZFile(fileToReveal));

            // Set openfolders to expand in the folder list
            // 这一步很重要，因为我们聚焦到了 A，必须确保 A 里面的 B 是展开状态，才能看到 B 被高亮
            const foldersToOpen = getAllFoldersToOpen(fileToReveal);
            let openFoldersSet = new Set([...openFolders, ...foldersToOpen]);
            setOpenFolders(Array.from(openFoldersSet));

            // 滚动定位
            scrollToFile(FileTreeUtils.TFile2OZFile(fileToReveal));
            scrollToFolder(parentFolder); // 让左侧文件夹树滚动到 B 的位置
        }
    }

    return (
        <React.Fragment>
            {view === 'folder' ? (
                <MainFolder plugin={plugin} />
            ) : plugin.settings.evernoteView === 'Horizontal' ? (
                <SingleViewHorizontal plugin={plugin} />
            ) : plugin.settings.evernoteView === 'Vertical' ? (
                <SingleViewVertical plugin={plugin} />
            ) : (
                <FileComponent plugin={plugin} />
            )}
        </React.Fragment>
    );
}
