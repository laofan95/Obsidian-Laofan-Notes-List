const { Plugin, ItemView, Menu, setIcon, setTooltip, Notice, Modal, TFile, TFolder, PluginSettingTab, Setting, Keymap, MarkdownView } = require('obsidian');

const VIEW_TYPE = 'laofan-notes-list';

// 自定义确认对话框
class DeleteAttachmentModal extends Modal {
    constructor(app, message, onConfirm, onCancel) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;
        this.userAction = null; // 记录用户的操作：'confirm', 'cancel', 或 null（关闭X）
    }

    onOpen() {
        const { contentEl, titleEl, modalEl } = this;
        titleEl.setText('⚠️附件删除确认');
        
        // 添加类名以便通过 CSS 移除背景模糊效果
        const modalContainer = modalEl.closest('.modal-container');
        if (modalContainer) {
            modalContainer.addClass('laofan-delete-modal-container');
            // 直接设置背景为透明
            const modalBg = modalContainer.querySelector('.modal-bg');
            if (modalBg) {
                modalBg.style.backgroundColor = 'transparent';
                modalBg.style.background = 'transparent';
                modalBg.style.backdropFilter = 'none';
                modalBg.style.webkitBackdropFilter = 'none';
            }
        }
        
        // 显示消息内容
        const messageEl = contentEl.createDiv();
        messageEl.innerHTML = this.message.replace(/\n/g, '<br>');
        messageEl.style.marginBottom = '20px';
        messageEl.style.whiteSpace = 'pre-line';
        
        // 按钮容器
        const buttonContainer = contentEl.createDiv();
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginTop = '20px';
        
        // 仅删除笔记按钮（原来的取消按钮）
        const cancelBtn = buttonContainer.createEl('button', {
            text: '仅删除笔记',
            cls: 'mod-cta'
        });
        cancelBtn.addEventListener('click', () => {
            this.userAction = 'cancel';
            this.close();
        });
        
        // 确认删除附件按钮（原来的确定按钮）
        const confirmBtn = buttonContainer.createEl('button', {
            text: '确认删除附件',
            cls: 'mod-cta mod-warning'
        });
        confirmBtn.addEventListener('click', () => {
            this.userAction = 'confirm';
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        
        // 根据用户操作执行相应的回调
        if (this.userAction === 'confirm' && this.onConfirm) {
            this.onConfirm();
        } else if (this.userAction === 'cancel' && this.onCancel) {
            this.onCancel();
        }
        // 如果 userAction 为 null（点击X关闭），不执行任何操作
    }
}

// 自定义确认对话框（删除文件夹）
class DeleteFolderModal extends Modal {
    constructor(app, message, noteCount, onDeleteAll, onDeleteFolderOnly) {
        super(app);
        this.message = message;
        this.noteCount = noteCount;
        this.onDeleteAll = onDeleteAll;
        this.onDeleteFolderOnly = onDeleteFolderOnly;
        this.userAction = null; // 记录用户的操作：'deleteAll', 'deleteFolderOnly', 或 null（关闭X）
    }

    onOpen() {
        const { contentEl, titleEl, modalEl } = this;
        titleEl.setText('⚠️文件夹删除确认');
        
        // 添加类名以便通过 CSS 移除背景模糊效果
        const modalContainer = modalEl.closest('.modal-container');
        if (modalContainer) {
            modalContainer.addClass('laofan-delete-modal-container');
            // 直接设置背景为透明
            const modalBg = modalContainer.querySelector('.modal-bg');
            if (modalBg) {
                modalBg.style.backgroundColor = 'transparent';
                modalBg.style.background = 'transparent';
                modalBg.style.backdropFilter = 'none';
                modalBg.style.webkitBackdropFilter = 'none';
            }
        }
        
        // 显示消息内容
        const messageEl = contentEl.createDiv();
        messageEl.innerHTML = this.message.replace(/\n/g, '<br>');
        messageEl.style.marginBottom = '20px';
        messageEl.style.whiteSpace = 'pre-line';
        
        // 按钮容器
        const buttonContainer = contentEl.createDiv();
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginTop = '20px';
        
        // 只删除文件夹按钮（移动笔记到根目录）
        const deleteFolderOnlyBtn = buttonContainer.createEl('button', {
            text: '只删除文件夹',
            cls: 'mod-cta'
        });
        deleteFolderOnlyBtn.addEventListener('click', () => {
            this.userAction = 'deleteFolderOnly';
            this.close();
        });
        
        // 删除全部按钮（删除文件夹和所有笔记/附件）
        const deleteAllBtn = buttonContainer.createEl('button', {
            text: '删除全部笔记/附件',
            cls: 'mod-cta mod-warning'
        });
        deleteAllBtn.addEventListener('click', () => {
            this.userAction = 'deleteAll';
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        
        // 根据用户操作执行相应的回调
        if (this.userAction === 'deleteAll' && this.onDeleteAll) {
            this.onDeleteAll();
        } else if (this.userAction === 'deleteFolderOnly' && this.onDeleteFolderOnly) {
            this.onDeleteFolderOnly();
        }
        // 如果 userAction 为 null（点击X关闭），不执行任何操作
    }
}

class NotesListView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentCategory = null; // 默认不选择任何分类，显示全部内容
        this.searchQuery = '';
        this.allFilesData = [];
        this.selectedTag = null;
        this.allTags = new Set();
        this.currentlyOpenFile = null; // 记录当前打开的文件
        // 分页相关变量
        this.pageSize = 20; // 每页显示的笔记数量
        this.currentPage = 1; // 当前页码
        this.isLoading = false; // 是否正在加载
        this.hasMore = true; // 是否还有更多笔记
        this.filteredFiles = []; // 筛选后的所有笔记
        this.scrollPosition = 0; // 保存滚动位置
        this.shouldAutoScroll = false; // 是否应该自动滚动到当前笔记
        this.isUserScrolling = false; // 用户是否正在滚动
        // 从插件设置中获取配置
        this.updateSettings(plugin.settings);
    }

    getViewType() {
        return VIEW_TYPE;
    }

    getDisplayText() {
        return '笔记列表';
    }

    getIcon() {
        return 'file-text';
    }

    // 查找包含指定文件的标签页
    findLeafWithFile(file) {
        const allLeaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of allLeaves) {
            const view = leaf.view;
            if (view && view.file && view.file.path === file.path) {
                return leaf;
            }
        }
        return null;
    }

    // 更新设置
    updateSettings(settings) {
        if (!settings) return;
        this.pageSize = settings.pageSize || 20;
        this.maxTagsDisplay = settings.maxTagsDisplay || 3;
        this.showThumbnails = settings.showThumbnails !== false; // 默认为 true
        this.autoScrollToActiveNote = settings.autoScrollToActiveNote !== false; // 默认为 true
        this.showTimeTooltip = settings.showTimeTooltip !== false; // 默认为 true
        this.alwaysFocusCurrentTab = settings.alwaysFocusCurrentTab !== false; // 默认为 true
    }

    async onOpen() {
        await this.buildUI();
        await this.loadFilesData();
        
        // 获取当前活动文件
        this.currentlyOpenFile = this.app.workspace.getActiveFile()?.path || null;
        // 首次打开时，如果需要，可以自动滚动到当前笔记
        if (this.currentlyOpenFile && this.autoScrollToActiveNote) {
            this.shouldAutoScroll = true;
        }
        
        this.renderList();
        
        // 监听文件变化事件（包括在文件列表中修改）
        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                // 如果是 markdown 文件，重新加载数据并排序
                if (file instanceof TFile && file.extension === 'md') {
                    await this.loadFilesData();
                    this.resetPagination();
                    this.renderList();
                }
            })
        );
        
        this.registerEvent(
            this.app.vault.on('create', async (file) => {
                // 如果是 markdown 文件，重新加载数据并排序
                if (file instanceof TFile && file.extension === 'md') {
                    await this.loadFilesData();
                    this.resetPagination();
                    this.renderList();
                }
            })
        );
        
        this.registerEvent(
            this.app.vault.on('delete', async (file) => {
                // 如果是 markdown 文件，重新加载数据并排序
                if (file instanceof TFile && file.extension === 'md') {
                    await this.loadFilesData();
                    this.resetPagination();
                    this.renderList();
                }
            })
        );
        
        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                // 如果是 markdown 文件，重新加载数据并排序
                if (file instanceof TFile && file.extension === 'md') {
                    await this.loadFilesData();
                    this.resetPagination();
                    this.renderList();
                }
            })
        );
        
        // 监听元数据缓存变化事件（包括文件保存后的变化）
        this.registerEvent(
            this.app.metadataCache.on('changed', async (file) => {
                // 如果是 markdown 文件，重新加载数据并排序
                if (file instanceof TFile && file.extension === 'md') {
                    await this.loadFilesData();
                    this.resetPagination();
                    this.renderList();
                }
            })
        );
        
        // 监听工作区文件变化事件（包括在文件列表中修改）
        this.registerEvent(
            this.app.workspace.on('file-open', async (file) => {
                // 文件打开时，如果文件被修改，也会触发排序
                if (file instanceof TFile && file.extension === 'md') {
                    // 延迟一下，确保文件内容已保存
                    setTimeout(async () => {
                        await this.loadFilesData();
                        this.resetPagination();
                        this.renderList();
                    }, 500);
                }
            })
        );
        
        // 注意：上面的 metadataCache.on('changed') 已经处理了元数据变化事件
        
        // 监听当前活动文件变化
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                const previousFile = this.currentlyOpenFile;
                this.currentlyOpenFile = file?.path || null;
                // 更新当前标签页引用
                const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
                if (activeLeaf) {
                    this.currentLeaf = activeLeaf;
                }
                // 只有在文件真正变化时才重新渲染，避免不必要的渲染
                if (previousFile !== this.currentlyOpenFile) {
                    this.updateActiveNoteState(); // 只更新选中状态，不重新渲染整个列表
                }
            })
        );
        
        // 监听leaf切换事件
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (leaf) {
                    const activeFile = this.app.workspace.getActiveFile();
                    if (activeFile) {
                        const previousFile = this.currentlyOpenFile;
                        this.currentlyOpenFile = activeFile.path;
                        // 更新当前标签页引用
                        this.currentLeaf = leaf;
                        // 只有在文件真正变化时才更新
                        if (previousFile !== this.currentlyOpenFile) {
                            this.updateActiveNoteState(); // 只更新选中状态
                        }
                    }
                }
            })
        );
        
        // 监听标签页关闭事件
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                // 检查当前标签页是否还存在
                if (this.currentLeaf) {
                    const allLeaves = this.app.workspace.getLeavesOfType('markdown');
                    const leafExists = allLeaves.some(leaf => leaf === this.currentLeaf);
                    if (!leafExists) {
                        // 标签页已被关闭，清除引用
                        this.currentLeaf = null;
                    }
                }
            })
        );
        
        // 监听滚动事件，实现无限滚动
        let scrollTimeout;
        let checkBottomTimeout;
        this.listContainer.addEventListener('scroll', () => {
            // 保存滚动位置
            this.scrollPosition = this.listContainer.scrollTop;
            this.isUserScrolling = true;
            
            // 清除之前的定时器
            clearTimeout(scrollTimeout);
            // 300ms后认为用户停止滚动
            scrollTimeout = setTimeout(() => {
                this.isUserScrolling = false;
            }, 300);
            
            // 使用防抖检查是否滚动到底部，避免频繁切换显示状态
            clearTimeout(checkBottomTimeout);
            checkBottomTimeout = setTimeout(() => {
                this.checkScrollBottom();
                this.checkScrollTop(); // 检查是否在顶部，控制置顶按钮显示
            }, 100); // 100ms 防抖延迟
            
            this.handleScroll();
        });
    }

    async buildUI() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('laofan-notes-list-container');

        // 创建标题栏
        const headerContainer = container.createDiv('laofan-header-container');
        const titleEl = headerContainer.createDiv('laofan-header-title');
        titleEl.setText('笔记列表');
        
        const newNoteBtn = headerContainer.createEl('button', {
            cls: 'laofan-new-note-btn clickable-icon'
        });
        
        setIcon(newNoteBtn, 'file-plus');
        setTooltip(newNoteBtn, '新增笔记');
        
        newNoteBtn.addEventListener('click', async () => {
            await this.createNewNote();
        });

        // 创建搜索框容器
        const searchContainer = container.createDiv('laofan-search-container');
        
        // 创建搜索框内部容器，用于包含标签和输入框
        const searchInner = searchContainer.createDiv('laofan-search-inner');
        
        // 创建标签容器 - 初始隐藏，在搜索框内部左侧
        this.filterTagsContainer = searchInner.createDiv('laofan-filter-tags-container');
        this.filterTagsContainer.style.display = 'none';
        
        // 创建搜索输入框 - 在内部容器中
        const searchInput = searchInner.createEl('input', {
            type: 'text',
            cls: 'laofan-search-input',
            placeholder: '🔍搜索'
        });
        
        // 保存搜索输入框引用
        this.searchInput = searchInput;
        
        // 添加键盘事件处理，支持删除标签
        searchInput.addEventListener('keydown', (e) => {
            // 当输入框为空且按下退格键时，删除最后一个标签
            if (e.key === 'Backspace' && !searchInput.value && this.filterTagsContainer.children.length > 0) {
                e.preventDefault();
                // 获取最后一个标签的关闭按钮并触发点击
                const lastTag = this.filterTagsContainer.lastElementChild;
                if (lastTag) {
                    const closeBtn = lastTag.querySelector('.laofan-filter-tag-close');
                    if (closeBtn) {
                        closeBtn.click();
                    }
                }
            }
        });
        
        // 点击标签容器时聚焦搜索输入框
        this.filterTagsContainer.addEventListener('click', () => {
            searchInput.focus();
        });
        
        // 在renderFilterTags方法中添加单个标签点击聚焦逻辑
        const originalRenderFilterTags = this.renderFilterTags;
        this.renderFilterTags = () => {
            originalRenderFilterTags.call(this);
            // 为每个标签添加点击聚焦事件
            const tags = this.filterTagsContainer.querySelectorAll('.laofan-filter-tag');
            tags.forEach(tag => {
                tag.addEventListener('click', () => {
                    searchInput.focus();
                });
            });
        };

        // 监听搜索框焦点事件
        searchInput.addEventListener('focus', () => {
            searchInput.placeholder = '搜索笔记标题、内容、标签等';
        });
        
        searchInput.addEventListener('blur', () => {
            if (!searchInput.value) {
                searchInput.placeholder = '🔍搜索';
            }
        });

        // 监听搜索输入
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.resetPagination();
            this.renderList();
        });

        // 创建分类标签
        const categoryContainer = container.createDiv('laofan-category-container');
        const categories = ['最近使用', '笔记', '链接', '图片和视频', '文件'];
        
        categories.forEach((category) => {
            const categoryBtn = categoryContainer.createEl('button', {
                cls: 'laofan-category-btn',
                text: category
            });
            
            // 默认不选择任何分类，所以不添加active状态
            if (category === this.currentCategory) {
                categoryBtn.addClass('active');
            }
            
            categoryBtn.addEventListener('click', () => {
                this.currentCategory = category;
                this.selectedTag = null; // 清除标签筛选
                // 移除所有按钮的active状态
                categoryContainer.querySelectorAll('.laofan-category-btn').forEach(btn => {
                    btn.removeClass('active');
                });
                this.hideTagDropdown();
                this.resetPagination();
                this.renderList();
                // 聚焦搜索输入框
                this.searchInput.focus();
            });
        });
        
        // 添加下拉按钮
        const dropdownBtn = categoryContainer.createEl('button', {
            cls: 'laofan-dropdown-btn',
            text: '▼'
        });
        
        // 创建标签下拉菜单（相对于分类容器）
        this.tagDropdown = container.createDiv('laofan-tag-dropdown');
        this.tagDropdown.style.display = 'none';
        
        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleTagDropdown();
        });
        
        // 点击外部关闭下拉菜单
        this.closeDropdownHandler = (e) => {
            if (this.tagDropdown && !this.tagDropdown.contains(e.target) && !dropdownBtn.contains(e.target)) {
                this.hideTagDropdown();
            }
        };
        document.addEventListener('click', this.closeDropdownHandler);

        // 创建列表容器
        this.listContainer = container.createDiv('laofan-notes-list');
        
        // 创建底部笔记数量显示元素
        this.notesCountEl = container.createDiv('laofan-notes-count');
        this.notesCountEl.style.display = 'none'; // 默认隐藏
        
        // 创建快速置顶按钮
        this.scrollToTopBtn = container.createDiv('laofan-scroll-to-top-btn');
        this.scrollToTopBtn.style.display = 'none'; // 默认隐藏
        setIcon(this.scrollToTopBtn, 'arrow-up');
        setTooltip(this.scrollToTopBtn, '回到顶部');
        
        // 点击按钮滚动到顶部
        this.scrollToTopBtn.addEventListener('click', () => {
            if (this.listContainer) {
                this.listContainer.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        });
    }

    async loadFilesData() {
        const allFiles = this.app.vault.getMarkdownFiles();
        
        // 清空标签集合
        this.allTags.clear();
        
        // 获取文件内容和统计信息
        this.allFilesData = await Promise.all(
            allFiles.map(async (file) => {
                const stat = file.stat;
                const mtime = stat ? stat.mtime : 0;
                const ctime = stat ? stat.ctime : 0;
                
                let content = '';
                try {
                    content = await this.app.vault.read(file);
                } catch (e) {
                    console.error('读取文件失败:', file.path, e);
                }
                
                // 提取标签
                const tags = this.extractTags(content, file);
                tags.forEach(tag => this.allTags.add(tag));
                
                return {
                    file,
                    mtime,
                    ctime,
                    content: content || '',
                    basename: file.basename,
                    tags: tags
                };
            })
        );
        
        // 按修改时间排序（精确到毫秒，最新修改的排最前）
        this.allFilesData = this.allFilesData
            .sort((a, b) => {
                // 按修改时间降序排序（最新的在前）
                return b.mtime - a.mtime;
            });
        
        // 如果标签下拉菜单已打开，更新它
        if (this.tagDropdown && this.tagDropdown.style.display === 'block') {
            this.renderTagDropdown();
        }
    }

    extractTags(content, file) {
        const tags = [];
        
        // 从 frontmatter 提取标签
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
        if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            // 匹配 tags: [tag1, tag2] 或 tags: ["tag1", "tag2"]
            const tagsArrayMatch = frontmatter.match(/tags:\s*\[(.*?)\]/s);
            if (tagsArrayMatch) {
                tagsArrayMatch[1].split(',').forEach(tag => {
                    const cleanTag = tag.trim().replace(/['"]/g, '');
                    if (cleanTag) tags.push(cleanTag);
                });
            } else {
                // 匹配 tags: tag1 或 tags: "tag1" 或 tags: - tag1
                const tagsLines = frontmatter.split('\n').filter(line => line.trim().startsWith('tags:'));
                tagsLines.forEach(line => {
                    // 处理 tags: - tag1 格式
                    const dashMatch = line.match(/tags:\s*-\s*(.+)/);
                    if (dashMatch) {
                        const tag = dashMatch[1].trim().replace(/['"]/g, '');
                        if (tag) tags.push(tag);
                    } else {
                        // 处理 tags: tag1 格式
                        const simpleMatch = line.match(/tags:\s*(.+)/);
                        if (simpleMatch) {
                            const tag = simpleMatch[1].trim().replace(/['"]/g, '');
                            if (tag && !tag.startsWith('[')) {
                                tags.push(tag);
                            }
                        }
                    }
                });
            }
        }
        
        // 从内容中提取 #标签（排除代码块中的）
        const codeBlockRegex = /```[\s\S]*?```/g;
        const contentWithoutCode = content.replace(codeBlockRegex, '');
        const hashTags = contentWithoutCode.match(/#[\w\u4e00-\u9fa5]+/g);
        if (hashTags) {
            hashTags.forEach(tag => {
                const cleanTag = tag.substring(1); // 移除 #
                if (cleanTag && !tags.includes(cleanTag)) {
                    tags.push(cleanTag);
                }
            });
        }
        
        return tags;
    }

    toggleTagDropdown() {
        if (this.tagDropdown.style.display === 'none') {
            this.showTagDropdown();
        } else {
            this.hideTagDropdown();
        }
    }

    // 计算指定分类的笔记数量
    getCategoryCount(category) {
        let count = 0;
        this.allFilesData.forEach(item => {
            if (category === '最近使用') {
                const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                if (item.mtime >= oneMonthAgo) count++;
            } else if (category === '笔记') {
                if (item.file.extension === 'md') count++;
            } else if (category === '链接') {
                const urlPattern = /(https?:\/\/|ftp:\/\/|sftp:\/\/|mailto:|tel:|magnet:)[^\s]+/gi;
                if (urlPattern.test(item.content)) count++;
            } else if (category === '图片') {
                const imagePattern = /!\[[^\]]*\]\([^)]*\)|<img[^>]*src=["'][^"']*["']/gi;
                const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
                if (imagePattern.test(item.content) || imageExts.some(ext => item.content.toLowerCase().includes(ext))) count++;
            } else if (category === '视频') {
                const videoExts = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm'];
                if (videoExts.some(ext => item.content.toLowerCase().includes(ext))) count++;
            } else if (category === '图片和视频') {
                const imagePattern = /!\[[^\]]*\]\([^)]*\)|<img[^>]*src=["'][^"']*["']/gi;
                const mediaExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm'];
                if (imagePattern.test(item.content) || mediaExts.some(ext => item.content.toLowerCase().includes(ext))) count++;
            } else if (category === '文件') {
                // 文件：包含文件链接但排除图片
                const hasFileLink = this.hasFile(item.content);
                const hasImage = this.getFirstImageUrl(item.content) !== null;
                if (hasFileLink && !hasImage) count++;
            }
        });
        return count;
    }
    
    // 计算指定标签的笔记数量
    getTagCount(tag) {
        return this.allFilesData.filter(item => item.tags && item.tags.includes(tag)).length;
    }
    
    showTagDropdown() {
        this.tagDropdown.empty();
        this.tagDropdown.style.display = 'block';
        
        // 获取搜索框位置，将下拉框定位在搜索框正下方并向上移动2px
        const searchContainer = this.containerEl.querySelector('.laofan-search-container');
        if (searchContainer) {
            const rect = searchContainer.getBoundingClientRect();
            const containerRect = this.containerEl.getBoundingClientRect();
            this.tagDropdown.style.left = `${rect.left - containerRect.left}px`;
            this.tagDropdown.style.top = `${rect.bottom - containerRect.top + 2}px`;
            this.tagDropdown.style.width = `${rect.width}px`;
        }
        
        // 创建类型标题和折叠按钮的容器
        const typeHeaderContainer = this.tagDropdown.createDiv('laofan-type-header');
        
        // 添加"类型"标题
        const typeTitle = typeHeaderContainer.createDiv('laofan-modal-section-title');
        typeTitle.setText('类型');
        
        // 添加折叠按钮，与类型标题同一行
        const collapseBtn = typeHeaderContainer.createEl('button', {
            cls: 'laofan-modal-collapse-btn',
            text: '▲'
        });
        
        // 折叠按钮点击事件
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hideTagDropdown();
        });
        
        // 创建类型网格容器
        const typeGrid = this.tagDropdown.createDiv('laofan-modal-grid');
        
        // 添加分类选项，确保默认显示所有内容，新增图片和视频选项
        const categories = ['最近使用', '笔记', '链接', '图片', '视频', '图片和视频', '文件'];
        categories.forEach(category => {
            const count = this.getCategoryCount(category);
            const categoryBtn = typeGrid.createEl('button', {
                cls: 'laofan-modal-grid-item'
            });
            
            // 创建文本部分
            const textSpan = categoryBtn.createSpan('laofan-modal-grid-text');
            textSpan.setText(category);
            
            // 创建数字部分，用括号包裹，添加特殊样式
            const countSpan = categoryBtn.createSpan('laofan-modal-grid-count');
            countSpan.setText(` (${count})`);
            
            if (this.currentCategory === category) {
                categoryBtn.addClass('active');
            }
            categoryBtn.addEventListener('click', () => {
                this.currentCategory = category;
                this.selectedTag = null; // 清除标签筛选
                this.renderTagDropdown();
                this.resetPagination();
                this.renderList();
            });
        });
        
        // 添加"标签"标题
        const tagTitle = this.tagDropdown.createDiv('laofan-modal-section-title');
        tagTitle.setText('标签');
        
        // 创建标签网格容器
        const tagGrid = this.tagDropdown.createDiv('laofan-modal-grid');
        
        // 添加"全部"标签选项
        const allTagBtn = tagGrid.createEl('button', {
            cls: 'laofan-modal-grid-item'
        });
        
        // 创建文本部分
        const allTextSpan = allTagBtn.createSpan('laofan-modal-grid-text');
        allTextSpan.setText('全部');
        
        // 创建数字部分
        const allCountSpan = allTagBtn.createSpan('laofan-modal-grid-count');
        allCountSpan.setText(` (${this.allFilesData.length})`);
        
        if (!this.selectedTag) {
            allTagBtn.addClass('active');
        }
        allTagBtn.addEventListener('click', () => {
            this.selectedTag = null;
            this.renderTagDropdown();
            this.resetPagination();
            this.renderList();
        });
        
        // 添加所有标签，网格布局展示，显示数量
        const sortedTags = Array.from(this.allTags).sort();
        sortedTags.forEach(tag => {
            const count = this.getTagCount(tag);
            const tagBtn = tagGrid.createEl('button', {
                cls: 'laofan-modal-grid-item'
            });
            
            // 创建文本部分
            const textSpan = tagBtn.createSpan('laofan-modal-grid-text');
            textSpan.setText(tag);
            
            // 创建数字部分
            const countSpan = tagBtn.createSpan('laofan-modal-grid-count');
            countSpan.setText(` (${count})`);
            
            if (this.selectedTag === tag) {
                tagBtn.addClass('active');
            }
            tagBtn.addEventListener('click', () => {
                this.selectedTag = tag;
                this.renderTagDropdown();
                this.resetPagination();
                this.renderList();
            });
        });
        
        // 添加总数量显示在右下角
        const totalCountContainer = this.tagDropdown.createDiv('laofan-modal-total-count');
        totalCountContainer.setText(`共 ${this.allFilesData.length} 篇笔记`);
    }

    renderTagDropdown() {
        if (this.tagDropdown.style.display === 'block') {
            this.showTagDropdown();
        }
    }

    hideTagDropdown() {
        this.tagDropdown.style.display = 'none';
    }

    filterFiles() {
        let filtered = [...this.allFilesData];
        
        // 当有搜索关键词时，直接搜索所有文件，忽略分类限制
        if (this.searchQuery) {
            filtered = filtered.filter(item => {
                const searchLower = this.searchQuery.toLowerCase();
                const hasTagMatch = item.tags && item.tags.some(tag => 
                    tag.toLowerCase().includes(searchLower)
                );
                return item.basename.toLowerCase().includes(searchLower) ||
                       item.content.toLowerCase().includes(searchLower) ||
                       hasTagMatch;
            });
        } else {
            // 没有搜索关键词时，才进行分类筛选
            if (this.currentCategory !== null) {
                if (this.currentCategory === '最近使用') {
                    // 最近使用：只显示最近一个月的内容
                    const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                    filtered = filtered.filter(item => item.mtime >= oneMonthAgo);
                } else if (this.currentCategory === '笔记') {
                    // 笔记：所有 markdown 文件
                    filtered = filtered.filter(item => item.file.extension === 'md');
                } else if (this.currentCategory === '链接') {
                    // 链接：包含各种协议的链接的笔记
                    const urlPattern = /(https?:\/\/|ftp:\/\/|sftp:\/\/|mailto:|tel:|magnet:)[^\s]+/gi;
                    filtered = filtered.filter(item => urlPattern.test(item.content));
                } else if (this.currentCategory === '图片') {
                    // 图片：包含图片链接的笔记
                    const imagePattern = /!\[[^\]]*\]\([^)]*\)|<img[^>]*src=["'][^"']*["']/gi;
                    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
                    filtered = filtered.filter(item => 
                        imagePattern.test(item.content) ||
                        imageExts.some(ext => item.content.toLowerCase().includes(ext))
                    );
                } else if (this.currentCategory === '视频') {
                    // 视频：包含视频链接的笔记
                    const videoExts = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm'];
                    filtered = filtered.filter(item => 
                        videoExts.some(ext => item.content.toLowerCase().includes(ext))
                    );
                } else if (this.currentCategory === '图片和视频') {
                    // 图片和视频：包含图片或视频链接的笔记
                    const imagePattern = /!\[[^\]]*\]\([^)]*\)|<img[^>]*src=["'][^"']*["']/gi;
                    const mediaExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm'];
                    filtered = filtered.filter(item => 
                        imagePattern.test(item.content) ||
                        mediaExts.some(ext => item.content.toLowerCase().includes(ext))
                    );
                } else if (this.currentCategory === '文件') {
                    // 文件：包含附件引用或文件链接的笔记，但排除图片
                    filtered = filtered.filter(item => {
                        // 检查是否有文件链接（非图片）
                        const hasFileLink = this.hasFile(item.content);
                        // 检查是否有图片（如果有图片，则排除）
                        const hasImage = this.getFirstImageUrl(item.content) !== null;
                        // 只返回有文件但没有图片的笔记
                        return hasFileLink && !hasImage;
                    });
                }
            }
        }
        
        // 根据标签筛选（无论是否有搜索关键词）
        if (this.selectedTag) {
            filtered = filtered.filter(item => 
                item.tags && item.tags.includes(this.selectedTag)
            );
        }
        
        return filtered;
    }

    // 重置分页
    resetPagination() {
        this.currentPage = 1;
        this.isLoading = false;
        this.hasMore = true;
        this.filteredFiles = [];
        this.scrollPosition = 0; // 重置滚动位置
        this.shouldAutoScroll = false; // 重置自动滚动标志
        this.renderFilterTags(); // 重置时重新渲染筛选标签
    }
    
    // 渲染筛选标签
    renderFilterTags() {
        // 清空现有标签
        this.filterTagsContainer.empty();
        
        let hasFilters = false;
        
        // 如果有选择的分类，添加分类标签
        if (this.currentCategory) {
            const categoryTag = this.filterTagsContainer.createDiv('laofan-filter-tag');
            categoryTag.setText(this.currentCategory);
            
            // 添加关闭按钮
            const closeBtn = categoryTag.createSpan('laofan-filter-tag-close');
            closeBtn.setText('×');
            closeBtn.addEventListener('click', () => {
                this.currentCategory = null;
                this.resetPagination();
                this.renderList();
                // 移除按钮的active状态
                const categoryBtns = this.containerEl.querySelectorAll('.laofan-category-btn');
                categoryBtns.forEach(btn => btn.removeClass('active'));
            });
            hasFilters = true;
        }
        
        // 如果有选择的标签，添加标签筛选
        if (this.selectedTag) {
            const tagTag = this.filterTagsContainer.createDiv('laofan-filter-tag');
            tagTag.setText(this.selectedTag);
            
            // 添加关闭按钮
            const closeBtn = tagTag.createSpan('laofan-filter-tag-close');
            closeBtn.setText('×');
            closeBtn.addEventListener('click', () => {
                this.selectedTag = null;
                this.resetPagination();
                this.renderList();
                // 更新标签下拉菜单的active状态
                this.renderTagDropdown();
            });
            hasFilters = true;
        }
        
        // 显示或隐藏筛选标签容器
        this.filterTagsContainer.style.display = hasFilters ? 'flex' : 'none';
    }
    
    // 处理滚动事件，实现无限滚动
    handleScroll() {
        if (this.isLoading || !this.hasMore) return;
        
        const { scrollTop, scrollHeight, clientHeight } = this.listContainer;
        
        // 当滚动到距离底部50px时，加载更多
        if (scrollHeight - scrollTop - clientHeight < 50) {
            this.loadMore();
        }
    }
    
    // 检查是否滚动到底部，显示/隐藏笔记数量
    checkScrollBottom() {
        if (!this.listContainer || !this.notesCountEl) return;
        
        const { scrollTop, scrollHeight, clientHeight } = this.listContainer;
        // 增加误差范围到20px，并考虑可能的舍入误差
        const distanceToBottom = scrollHeight - scrollTop - clientHeight;
        const isAtBottom = distanceToBottom <= 20; // 允许20px的误差，更稳定
        
        if (isAtBottom) {
            this.notesCountEl.style.display = 'block';
        } else {
            this.notesCountEl.style.display = 'none';
        }
    }
    
    // 检查是否在顶部，显示/隐藏快速置顶按钮
    checkScrollTop() {
        if (!this.listContainer || !this.scrollToTopBtn) return;
        
        const { scrollTop } = this.listContainer;
        const isAtTop = scrollTop <= 20; // 允许20px的误差
        
        if (isAtTop) {
            this.scrollToTopBtn.style.display = 'none';
        } else {
            this.scrollToTopBtn.style.display = 'flex';
        }
    }
    
    // 只更新当前活动笔记的选中状态，不重新渲染整个列表
    updateActiveNoteState() {
        if (!this.listContainer) return;
        
        // 移除所有笔记项的选中状态
        const allNoteItems = this.listContainer.querySelectorAll('.laofan-note-item');
        allNoteItems.forEach(item => {
            item.removeClass('laofan-note-item-active');
        });
        
        // 为当前打开的笔记添加选中状态
        if (this.currentlyOpenFile) {
            // 遍历所有笔记项，通过数据属性匹配文件路径
            allNoteItems.forEach(item => {
                const filePath = item.getAttribute('data-file-path');
                if (filePath === this.currentlyOpenFile) {
                    item.addClass('laofan-note-item-active');
                }
            });
        }
    }
    
    // 加载更多笔记
    async loadMore() {
        if (this.isLoading || !this.hasMore) return;
        
        this.isLoading = true;
        this.currentPage++;
        
        // 渲染更多笔记
        this.renderList(true);
        
        this.isLoading = false;
        
        // 加载更多内容后，如果已经在底部，确保笔记数量显示
        requestAnimationFrame(() => {
            this.checkScrollBottom();
        });
    }
    
    // 检查文件扩展名是否为图片格式
    isImageExtension(filePath) {
        if (!filePath) return false;
        const ext = filePath.toLowerCase().split('.').pop().split('|')[0].trim(); // 处理可能的尺寸参数
        const imageExtensions = [
            'jpg', 'jpeg', 'jpe', 'jfif', // JPEG
            'png', // PNG
            'gif', // GIF
            'webp', // WebP
            'heic', 'heif', // HEIC/HEIF
            'svg', // SVG
            'bmp', // BMP
            'wbmp', // WBMP
            'avif', // AVIF
            'ico' // ICO
        ];
        return imageExtensions.includes(ext);
    }
    
    // 提取笔记内容中的第一张图片URL（只识别真正的图片格式）
    getFirstImageUrl(content) {
        // 匹配Obsidian内部图片链接：![[image.jpg]] 或 ![[path/image.jpg]]
        const wikiImageMatch = content.match(/!\[\[([^\]]+)\]\]/);
        if (wikiImageMatch && wikiImageMatch[1]) {
            const imagePath = wikiImageMatch[1].split('|')[0].trim(); // 处理可能的尺寸参数
            // 只有图片格式才返回，否则返回null
            if (this.isImageExtension(imagePath)) {
                return 'internal:' + imagePath;
            }
            // 如果不是图片格式，返回null（让hasFile处理）
            return null;
        }
        
        // 匹配Markdown图片链接：![alt](url)
        const markdownImageMatch = content.match(/!\[(.*?)\]\((.*?)\)/);
        if (markdownImageMatch && markdownImageMatch[2]) {
            const url = markdownImageMatch[2].trim();
            // 检查URL是否为图片格式
            if (this.isImageExtension(url)) {
                return url;
            }
            return null;
        }
        
        // 匹配HTML图片标签：<img src="url">
        const htmlImageMatch = content.match(/<img.*?src=["'](.*?)["'].*?>/);
        if (htmlImageMatch && htmlImageMatch[1]) {
            const url = htmlImageMatch[1].trim();
            // 检查URL是否为图片格式
            if (this.isImageExtension(url)) {
                return url;
            }
            return null;
        }
        
        return null;
    }
    
    // 检查笔记内容是否包含图片
    hasImage(content) {
        return this.getFirstImageUrl(content) !== null;
    }
    
    // 获取第一个文件链接（用于显示文件图标）
    getFirstFileLink(content) {
        // 匹配所有内部链接（包括 ![[file]] 和 [[file]]）
        const wikiLinkMatches = content.matchAll(/!?\[\[([^\]]+)\]\]/g);
        for (const match of wikiLinkMatches) {
            const linkPath = match[1].split('|')[0].trim();
            // 如果不是图片格式，则视为文件
            if (!this.isImageExtension(linkPath)) {
                return 'internal:' + linkPath;
            }
        }
        
        // 匹配Markdown链接中的文件（非图片链接，排除以!开头的图片链接）
        const markdownLinkMatches = content.matchAll(/\[(.*?)\]\((.*?)\)/g);
        for (const match of markdownLinkMatches) {
            // 检查是否是以!开头的图片链接
            const fullMatch = match[0];
            if (fullMatch.startsWith('!')) {
                continue; // 跳过图片链接
            }
            const url = match[2].trim();
            // 如果不是图片格式，则视为文件
            if (!this.isImageExtension(url)) {
                return url;
            }
        }
        
        // 匹配 [文件] 标记
        const filePattern = /\[文件\].*?\.([^\s\]\)]+)/g;
        const fileMatch = filePattern.exec(content);
        if (fileMatch && fileMatch[0]) {
            return fileMatch[0]; // 返回完整的匹配内容
        }
        
        return null;
    }
    
    // 检查笔记内容是否包含文件
    hasFile(content) {
        return this.getFirstFileLink(content) !== null;
    }
    
    // 获取笔记中的所有附件文件（图片和其他文件）
    getAllAttachments(file) {
        const attachments = [];
        try {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) return attachments;
            
            // 获取所有嵌入文件（图片和其他嵌入的文件）
            if (cache.embeds) {
                for (const embed of cache.embeds) {
                    const linkPath = embed.link.split('|')[0].trim();
                    const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, file.path);
                    if (linkedFile) {
                        attachments.push(linkedFile);
                    }
                }
            }
        } catch (e) {
            console.error('获取附件失败:', e);
        }
        return attachments;
    }
    
    // 根据文件扩展名获取文件图标
    getFileIcon(filePath) {
        if (!filePath) return { icon: '📄', type: 'default' };
        
        const ext = filePath.toLowerCase().split('.').pop().split('|')[0].trim();
        
        // JavaScript 文件
        if (['js', 'jsx'].includes(ext)) return { icon: 'JS', type: 'js' };
        
        // TypeScript 文件
        if (['ts', 'tsx'].includes(ext)) return { icon: 'TS', type: 'code' };
        
        // CSS 文件
        if (['css', 'scss', 'sass', 'less'].includes(ext)) return { icon: '#', type: 'css' };
        
        // JSON 文件
        if (['json'].includes(ext)) return { icon: '{}', type: 'json' };
        
        // YAML 文件
        if (['yaml', 'yml'].includes(ext)) return { icon: 'YAML', type: 'code' };
        
        // 表格文件
        if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: '⊞', type: 'table' };
        
        // 压缩文件
        if (['zip', 'rar', '7z', 'gzip', 'gz', 'tar'].includes(ext)) return { icon: '📦', type: 'archive' };
        if (['cbr', 'cbz', 'cb7'].includes(ext)) return { icon: '📚', type: 'archive' };
        
        // 文档文件
        if (['pdf'].includes(ext)) return { icon: '📕', type: 'document' };
        if (['doc', 'docx'].includes(ext)) return { icon: '📘', type: 'document' };
        if (['ppt', 'pptx'].includes(ext)) return { icon: '📽️', type: 'document' };
        
        // 代码文件（通用代码图标）
        if (['html', 'htm', 'xml'].includes(ext)) return { icon: '</>', type: 'code' };
        if (['py'].includes(ext)) return { icon: '</>', type: 'code' };
        if (['java'].includes(ext)) return { icon: '</>', type: 'code' };
        if (['cpp', 'c', 'h', 'hpp'].includes(ext)) return { icon: '</>', type: 'code' };
        if (['go'].includes(ext)) return { icon: '</>', type: 'code' };
        if (['rs'].includes(ext)) return { icon: '</>', type: 'code' };
        if (['php'].includes(ext)) return { icon: '</>', type: 'code' };
        if (['rb'].includes(ext)) return { icon: '</>', type: 'code' };
        if (['swift'].includes(ext)) return { icon: '</>', type: 'code' };
        if (['kt'].includes(ext)) return { icon: '</>', type: 'code' };
        if (['vue'].includes(ext)) return { icon: '</>', type: 'code' };
        if (['sh', 'bash', 'zsh', 'fish'].includes(ext)) return { icon: '</>', type: 'code' };
        
        // 文本文件
        if (['txt', 'md', 'markdown'].includes(ext)) return { icon: '📄', type: 'text' };
        
        // 默认文件图标
        return { icon: '📄', type: 'default' };
    }
    
    renderList(append = false) {
        // 保存当前滚动位置（在清空列表之前）
        if (!append && this.listContainer) {
            this.scrollPosition = this.listContainer.scrollTop;
        }
        
        // 重新获取筛选后的所有笔记，无论是否追加
        const allFilteredFiles = this.filterFiles();
        
        // 如果不是追加渲染，则清空列表并重置filteredFiles
        if (!append) {
            this.listContainer.empty();
            this.filteredFiles = allFilteredFiles;
            this.hasMore = this.filteredFiles.length > 0;
        } else {
            // 追加时，更新filteredFiles为最新的筛选结果
            this.filteredFiles = allFilteredFiles;
        }
        
        if (this.filteredFiles.length === 0) {
            this.listContainer.createDiv({
                cls: 'laofan-empty-state',
                text: '暂无笔记'
            });
            // 更新笔记数量（为0）
            this.updateNotesCount();
            // 隐藏笔记数量（因为列表为空）
            if (this.notesCountEl) {
                this.notesCountEl.style.display = 'none';
            }
            return;
        }

        // 记录当前打开的文件对应的笔记项元素
        let activeNoteElement = null;
        
        // 计算当前页要显示的笔记范围
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = this.currentPage * this.pageSize;
        const currentPageFiles = this.filteredFiles.slice(startIndex, endIndex);
        
        // 检查是否还有更多笔记
        this.hasMore = endIndex < this.filteredFiles.length;

        // 移除所有现有的加载更多按钮
        this.listContainer.querySelectorAll('.laofan-load-more-btn').forEach(btn => btn.remove());

        // 创建笔记项
        currentPageFiles.forEach((item, index) => {
            const noteItem = this.listContainer.createDiv('laofan-note-item');
            // 将文件路径存储为数据属性，方便后续查找
            noteItem.setAttribute('data-file-path', item.file.path);
            const modifiedDate = new Date(item.mtime);
            
            // 添加序列号
            const serialNumber = noteItem.createDiv('laofan-note-serial');
            serialNumber.setText(`${startIndex + index + 1}`);
            
            // 检查当前笔记是否是正在打开的文件，如果是则添加选中状态
            if (this.currentlyOpenFile === item.file.path) {
                noteItem.addClass('laofan-note-item-active');
                activeNoteElement = noteItem; // 保存当前活动笔记的元素
            }
            
            // 检查笔记中是否包含图片或文件
            const firstImageUrl = this.getFirstImageUrl(item.content);
            const firstFileLink = this.getFirstFileLink(item.content);
            const hasFile = firstFileLink !== null;
            
            // 创建笔记内容容器，用于包含标题、内容和缩略图
            const noteContentContainer = noteItem.createDiv('laofan-note-content-container');
            
            // 如果有图片，使用实际图片作为缩略图（如果启用了缩略图显示）
            if (firstImageUrl && this.showThumbnails) {
                const thumbnailEl = noteContentContainer.createDiv('laofan-note-thumbnail');
                thumbnailEl.addClass('laofan-note-thumbnail-image');
                
                // 创建图片元素
                const imgEl = document.createElement('img');
                
                // 处理内部图片链接（![[image.jpg]]格式）
                let imageSrc = firstImageUrl;
                if (firstImageUrl.startsWith('internal:')) {
                    const internalPath = firstImageUrl.substring(9); // 移除 'internal:' 前缀
                    // 使用 metadataCache 解析链接路径（处理可能的别名和相对路径）
                    const linktext = internalPath.split('|')[0].trim();
                    const imageFile = this.app.metadataCache.getFirstLinkpathDest(linktext, item.file.path);
                    if (imageFile) {
                        // 使用 Obsidian 的资源路径
                        imageSrc = this.app.vault.adapter.getResourcePath(imageFile.path);
                    } else {
                        // 如果找不到文件，尝试直接使用路径
                        const imageFile2 = this.app.vault.getAbstractFileByPath(linktext);
                        if (imageFile2) {
                            imageSrc = this.app.vault.adapter.getResourcePath(imageFile2.path);
                        } else {
                            // 如果还是找不到，使用原始路径（可能会失败，但至少尝试）
                            imageSrc = linktext;
                        }
                    }
                }
                
                imgEl.src = imageSrc;
                imgEl.alt = '图片缩略图';
                imgEl.className = 'laofan-note-thumbnail-img';
                
                // 添加加载失败的处理，显示默认图标
                imgEl.onerror = function() {
                    this.style.display = 'none';
                    thumbnailEl.innerHTML = '🖼️';
                    thumbnailEl.style.fontSize = '20px';
                };
                
                thumbnailEl.appendChild(imgEl);
            } 
            // 如果有文件，显示文件图标（如果启用了缩略图显示）
            else if (hasFile && firstFileLink && this.showThumbnails) {
                const thumbnailEl = noteContentContainer.createDiv('laofan-note-thumbnail');
                thumbnailEl.addClass('laofan-note-thumbnail-file');
                
                // 获取文件路径（处理内部链接）
                let filePath = firstFileLink;
                if (firstFileLink.startsWith('internal:')) {
                    filePath = firstFileLink.substring(9); // 移除 'internal:' 前缀
                }
                
                // 根据文件类型显示不同的图标
                const fileIconData = this.getFileIcon(filePath);
                thumbnailEl.innerHTML = fileIconData.icon;
                thumbnailEl.setAttribute('data-file-type', fileIconData.type);
                
                // 根据文件类型设置样式
                if (fileIconData.type === 'js') {
                    thumbnailEl.style.fontSize = '14px';
                    thumbnailEl.style.fontWeight = 'bold';
                    thumbnailEl.style.color = '#F7DF1E'; // JavaScript 黄色
                    thumbnailEl.style.backgroundColor = 'rgba(247, 223, 30, 0.1)';
                } else if (fileIconData.type === 'css') {
                    thumbnailEl.style.fontSize = '18px';
                    thumbnailEl.style.fontWeight = 'bold';
                    thumbnailEl.style.color = '#1572B6'; // CSS 蓝色
                    thumbnailEl.style.backgroundColor = 'rgba(21, 114, 182, 0.1)';
                } else if (fileIconData.type === 'json') {
                    thumbnailEl.style.fontSize = '16px';
                    thumbnailEl.style.fontWeight = 'bold';
                    thumbnailEl.style.color = '#F7DF1E'; // JSON 黄色
                    thumbnailEl.style.backgroundColor = 'rgba(247, 223, 30, 0.1)';
                } else if (fileIconData.type === 'code') {
                    thumbnailEl.style.fontSize = '16px';
                    thumbnailEl.style.fontWeight = 'normal';
                    thumbnailEl.style.color = 'var(--text-normal)';
                } else if (fileIconData.type === 'table') {
                    // Excel 样式：绿色背景，白色 X
                    thumbnailEl.innerHTML = '<span style="color: white; font-weight: bold; font-size: 24px; line-height: 1;">X</span>';
                    thumbnailEl.style.fontSize = '24px';
                    thumbnailEl.style.fontWeight = 'bold';
                    thumbnailEl.style.color = 'white';
                    thumbnailEl.style.backgroundColor = '#217346'; // Excel 绿色
                    thumbnailEl.style.border = 'none';
                    thumbnailEl.style.display = 'flex';
                    thumbnailEl.style.alignItems = 'center';
                    thumbnailEl.style.justifyContent = 'center';
                } else {
                    thumbnailEl.style.fontSize = '20px';
                }
            }
            
            // 笔记标题（支持高亮）
            const titleEl = noteContentContainer.createDiv('laofan-note-title');
            if (this.searchQuery) {
                titleEl.innerHTML = this.highlightText(item.basename, this.searchQuery);
            } else {
                titleEl.setText(item.basename);
            }
            
            // 添加鼠标悬停提示（显示创建时间和修改时间）- 在整个笔记项上触发
            if (this.showTimeTooltip && item.ctime && item.mtime) {
                const formatDateTime = (timestamp) => {
                    const date = new Date(timestamp);
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    return `${year}-${month}-${day} ${hours}:${minutes}`;
                };
                
                const createTime = formatDateTime(item.ctime);
                const modifyTime = formatDateTime(item.mtime);
                const tooltipText = `创建于 ${createTime}\n最后修改于 ${modifyTime}`;
                
                // 在整个笔记项上添加tooltip，而不是只在标题上
                // 使用 Obsidian 的 setTooltip 函数，设置 placement 为 'right' 使 tooltip 显示在右侧
                setTooltip(noteItem, tooltipText, { placement: 'right' });
            }
            
            // 笔记内容预览（第一段或前100个字符，支持高亮）
            const contentPreview = this.getContentPreview(item.content);
            if (contentPreview) {
                const contentEl = noteContentContainer.createDiv('laofan-note-content');
                if (this.searchQuery) {
                    contentEl.innerHTML = this.highlightText(contentPreview, this.searchQuery);
                } else {
                    contentEl.setText(contentPreview);
                }
            }
            
            // 笔记底部信息栏
            const infoBar = noteItem.createDiv('laofan-note-info-bar');
            
            // 始终创建两个容器，确保布局正确
            const tagsContainer = infoBar.createDiv('laofan-note-tags-container');
            const timeContainer = infoBar.createDiv('laofan-note-time-container');
            
            // 标签显示在左侧，带有图标和点击筛选功能
            if (item.tags && item.tags.length > 0) {
                // 清空容器
                tagsContainer.empty();
                
                // 最多显示的标签数量（从设置中获取）
                const maxTags = this.maxTagsDisplay || 3;
                const displayTags = item.tags.slice(0, maxTags);
                
                displayTags.forEach((tag, index) => {
                    // 创建标签元素
                    const tagEl = tagsContainer.createSpan('laofan-note-tag-item');
                    
                    // 添加标签图标
                    const tagIcon = tagEl.createSpan('laofan-note-tag-icon');
                    tagIcon.innerHTML = '🏷️';
                    
                    // 添加标签文本
                    const tagText = tagEl.createSpan('laofan-note-tag-text');
                    
                    // 如果有搜索关键词，高亮显示
                    if (this.searchQuery) {
                        tagText.innerHTML = this.highlightText(tag, this.searchQuery);
                    } else {
                        tagText.setText(tag);
                    }
                    
                    // 添加点击事件，实现筛选功能
                    tagEl.addEventListener('click', (e) => {
                        e.stopPropagation(); // 阻止事件冒泡，避免触发笔记项的点击事件
                        this.selectedTag = tag;
                        this.resetPagination();
                        this.renderList();
                        // 聚焦搜索输入框
                        this.searchInput.focus();
                    });
                    
                    // 如果不是最后一个标签，添加分隔符
                    if (index < displayTags.length - 1) {
                        tagsContainer.createSpan('laofan-note-tag-separator').setText(' | ');
                    }
                });
            }
            
            // 时间显示在右侧
            const timeText = this.formatDate(modifiedDate);
            timeContainer.setText(timeText);
            
            // 点击打开笔记（根据设置和 Ctrl 键决定打开方式）
            noteItem.addEventListener('click', async (e) => {
                e.preventDefault();
                // 保存当前滚动位置
                this.scrollPosition = this.listContainer.scrollTop;
                // 标记不需要自动滚动（用户主动点击，不应该自动滚动）
                this.shouldAutoScroll = false;
                
                // 检查是否按了 Ctrl/Cmd 键
                const isModKey = Keymap.isModEvent(e);
                
                // 根据设置和按键决定打开方式
                let targetLeaf;
                if (isModKey) {
                    // Ctrl+点击：强制在新标签页打开
                    targetLeaf = this.app.workspace.getLeaf(true);
                } else if (this.alwaysFocusCurrentTab) {
                    // 始终聚焦当前标签页：始终在同一个标签页打开
                    if (this.currentLeaf) {
                        // 检查标签页是否仍然存在
                        const allLeaves = this.app.workspace.getLeavesOfType('markdown');
                        const leafExists = allLeaves.some(leaf => leaf === this.currentLeaf);
                        if (leafExists) {
                            // 标签页存在，使用它
                            targetLeaf = this.currentLeaf;
                        } else {
                            // 标签页已被关闭，使用当前活动标签页（如果不存在则创建新标签页）
                            targetLeaf = this.app.workspace.getLeaf(false);
                            this.currentLeaf = targetLeaf;
                        }
                    } else {
                        // 没有当前标签页，使用当前活动标签页（如果不存在则创建新标签页）
                        targetLeaf = this.app.workspace.getLeaf(false);
                        this.currentLeaf = targetLeaf;
                    }
                } else {
                    // 关闭功能：每个笔记都在新标签页打开，但相同笔记只打开一个
                    // 先检查文件是否已经在某个标签页打开
                    const existingLeaf = this.findLeafWithFile(item.file);
                    if (existingLeaf) {
                        // 文件已经在某个标签页打开，切换到那个标签页
                        targetLeaf = existingLeaf;
                        // 激活该标签页
                        this.app.workspace.setActiveLeaf(targetLeaf);
                    } else {
                        // 文件没有打开，创建新标签页
                        targetLeaf = this.app.workspace.getLeaf(true);
                    }
                    this.currentLeaf = targetLeaf;
                }
                
                await targetLeaf.openFile(item.file);
                // 更新当前标签页引用
                this.currentLeaf = targetLeaf;
                // 更新选中状态，但不重新渲染整个列表
                this.updateActiveNoteState();
            });
            
            // 右键菜单
            noteItem.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const file = item.file;
                const menu = new Menu(this.app);
                menu.addItem((menuItem) => {
                    menuItem.setTitle('在新标签中打开')
                        .setIcon('file-plus')
                        .onClick(() => {
                            this.app.workspace.openLinkText(file.path, '', false);
                        });
                });
                menu.addItem((menuItem) => {
                    menuItem.setTitle('删除')
                        .setIcon('trash')
                        .onClick(async () => {
                            // 获取所有附件
                            const attachments = this.getAllAttachments(file);
                            
                            if (attachments.length > 0 && this.plugin.settings.enableDeleteAttachmentPrompt) {
                                // 构建附件列表文本
                                const attachmentNames = attachments.slice(0, 5).map(f => f.name).join('\n');
                                const moreText = attachments.length > 5 ? `\n... 还有 ${attachments.length - 5} 个文件` : '';
                                const message = `此笔记包含 ${attachments.length} 个附件：\n\n${attachmentNames}${moreText}\n\n是否同时删除这些附件文件？`;
                                
                                // 显示自定义确认对话框
                                new DeleteAttachmentModal(
                                    this.app,
                                    message,
                                    // 确定回调：删除附件和笔记
                                    async () => {
                                        // 先删除附件
                                        for (const attachment of attachments) {
                                            try {
                                                await this.app.vault.delete(attachment);
                                            } catch (e) {
                                                console.error('删除附件失败:', attachment.path, e);
                                            }
                                        }
                                        new Notice(`已删除 ${attachments.length} 个附件文件`);
                                        
                                        // 删除笔记本身
                                        await this.app.vault.delete(file);
                                        await this.loadFilesData();
                                        this.resetPagination();
                                        this.renderList();
                                    },
                                    // 取消回调：只删除笔记，保留附件
                                    async () => {
                                        // 只删除笔记，保留附件
                                        await this.app.vault.delete(file);
                                        await this.loadFilesData();
                                        this.resetPagination();
                                        this.renderList();
                                    }
                                ).open();
                            } else {
                                // 没有附件，直接删除笔记
                                await this.app.vault.delete(file);
                                await this.loadFilesData();
                                this.resetPagination();
                                this.renderList();
                            }
                        });
                });
                this.app.workspace.trigger('file-menu', menu, file, 'link-context-menu');
                menu.showAtPosition({ x: e.clientX, y: e.clientY });
            });
        });
        
        // 恢复滚动位置或滚动到活动笔记
        if (!append) {
            // 使用requestAnimationFrame确保DOM已经渲染完成
            requestAnimationFrame(() => {
                if (this.shouldAutoScroll && activeNoteElement && !this.isUserScrolling) {
                    // 只有在明确需要自动滚动且用户没有在滚动时才滚动
                    activeNoteElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest'
                    });
                    this.shouldAutoScroll = false; // 重置标志
                } else if (this.scrollPosition > 0) {
                    // 恢复之前的滚动位置（只有在有保存的位置时才恢复）
                    this.listContainer.scrollTop = this.scrollPosition;
                }
            });
        } else {
            // 追加内容时，保持当前滚动位置（不改变）
            // 这样用户可以看到新加载的内容
        }
        
        // 如果还有更多笔记，添加加载更多按钮到列表底部
        if (this.hasMore) {
            const loadMoreBtn = this.listContainer.createDiv('laofan-load-more-btn');
            loadMoreBtn.setText('加载更多');
            // 确保this上下文正确，使用箭头函数
            loadMoreBtn.addEventListener('click', () => this.loadMore());
        }
        
        // 更新笔记数量显示
        this.updateNotesCount();
        
        // 检查初始滚动位置（使用 requestAnimationFrame 确保 DOM 已渲染）
        requestAnimationFrame(() => {
            // 再次使用 requestAnimationFrame 确保布局计算完成
            requestAnimationFrame(() => {
                this.checkScrollBottom();
                this.checkScrollTop(); // 检查初始位置，控制置顶按钮显示
            });
        });
    }
    
    // 更新笔记数量显示
    updateNotesCount() {
        if (!this.notesCountEl) return;
        
        const totalCount = this.filteredFiles.length;
        this.notesCountEl.setText(`共 ${totalCount} 篇笔记`);
    }

    getContentPreview(content) {
        // 移除 frontmatter
        const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
        let text = content.replace(frontmatterRegex, '');
        
        // 移除 markdown 语法
        text = text
            .replace(/^#+\s+/gm, '') // 标题
            .replace(/\*\*(.*?)\*\*/g, '$1') // 粗体
            .replace(/\*(.*?)\*/g, '$1') // 斜体
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // 链接
            .replace(/!\[(.*?)\]\(.*?\)/g, '$1') // 图片
            .replace(/`(.*?)`/g, '$1') // 行内代码
            .replace(/```[\s\S]*?```/g, '') // 代码块
            .trim();
        
        // 取前两行内容
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
            // 取前两行，合并成一个预览
            const previewLines = lines.slice(0, 2).join('\n').trim();
            return previewLines.length > 100 ? previewLines.substring(0, 100) + '...' : previewLines;
        }
        
        return '';
    }

    highlightText(text, query) {
        if (!query || !text) return text;
        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        return text.replace(regex, '<mark class="laofan-search-highlight">$1</mark>');
    }

    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    formatDate(date) {
        const now = new Date();
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const nowYear = now.getFullYear();
        const nowMonth = now.getMonth() + 1;
        const nowDay = now.getDate();
        
        // 今天
        if (year === nowYear && month === nowMonth && day === nowDay) {
            return '今天';
        }
        
        // 昨天
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (year === yesterday.getFullYear() && month === yesterday.getMonth() + 1 && day === yesterday.getDate()) {
            return '昨天';
        }
        
        // 今年：显示 月日
        if (year === nowYear) {
            return `${month}月${day}日`;
        }
        
        // 往年：显示 年月日
        return `${year}年${month}月${day}日`;
    }

    async createNewNote() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const baseFileName = `新笔记-${dateStr}`;
        let fileName = `${baseFileName}.md`;
        let filePath = fileName;
        
        // 检查文件是否已存在，如果存在则添加序号
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(filePath)) {
            fileName = `${baseFileName}-${counter}.md`;
            filePath = fileName;
            counter++;
        }
        
        try {
            const newFile = await this.app.vault.create(filePath, '');
            await this.loadFilesData();
            this.renderList();
            // 滚动到列表顶部，确保新笔记显示在最顶部
            this.listContainer.scrollTop = 0;
            // 在当前标签页打开新创建的笔记
            await this.app.workspace.openLinkText(filePath, '', false);
        } catch (error) {
            console.error('创建笔记失败:', error);
        }
    }

    async onClose() {
        // 清理工作
        if (this.closeDropdownHandler) {
            document.removeEventListener('click', this.closeDropdownHandler);
        }
    }
}

class LaofanPlugin extends Plugin {
    settings = {
        pageSize: 20, // 每页显示的笔记数量
        autoScrollToActiveNote: true, // 是否自动滚动到当前打开的笔记
        showThumbnails: true, // 是否显示缩略图
        maxTagsDisplay: 3, // 每个笔记最多显示的标签数量
        enableDeleteAttachmentPrompt: true, // 是否启用删除附件提示
        enableDeleteFolderPrompt: true, // 是否启用删除文件夹提示
        showTimeTooltip: true, // 是否显示时间提示（创建时间和修改时间）
        alwaysFocusCurrentTab: true, // 是否始终聚焦当前标签页（如果关闭则在新标签页打开）
    };

    async loadSettings() {
        this.settings = Object.assign({}, this.settings, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // 通知所有视图更新设置
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
        leaves.forEach(leaf => {
            if (leaf.view instanceof NotesListView) {
                leaf.view.updateSettings(this.settings);
            }
        });
    }

    // 获取笔记中的所有附件文件（图片和其他文件）
    getAllAttachments(file) {
        const attachments = [];
        try {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) return attachments;
            
            // 获取所有嵌入文件（图片和其他嵌入的文件）
            if (cache.embeds) {
                for (const embed of cache.embeds) {
                    const linkPath = embed.link.split('|')[0].trim();
                    const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, file.path);
                    if (linkedFile) {
                        attachments.push(linkedFile);
                    }
                }
            }
        } catch (e) {
            console.error('获取附件失败:', e);
        }
        return attachments;
    }

    // 获取文件夹中的所有笔记文件
    getNotesInFolder(folder) {
        if (!(folder instanceof TFolder)) {
            return [];
        }
        
        const notes = [];
        const allFiles = this.app.vault.getMarkdownFiles();
        
        for (const file of allFiles) {
            // 检查文件是否在指定文件夹中（包括子文件夹）
            if (file.path.startsWith(folder.path + '/')) {
                notes.push(file);
            }
        }
        
        return notes;
    }

    // 通用的删除文件函数（带附件删除提示）
    async deleteFileWithAttachments(file) {
        // 只处理 markdown 文件
        if (!(file instanceof TFile) || file.extension !== 'md') {
            return false;
        }

        // 获取所有附件
        const attachments = this.getAllAttachments(file);
        
        if (attachments.length > 0 && this.settings.enableDeleteAttachmentPrompt) {
            // 构建附件列表文本
            const attachmentNames = attachments.slice(0, 5).map(f => f.name).join('\n');
            const moreText = attachments.length > 5 ? `\n... 还有 ${attachments.length - 5} 个文件` : '';
            const message = `此笔记包含 ${attachments.length} 个附件：\n\n${attachmentNames}${moreText}\n\n是否同时删除这些附件文件？`;
            
            // 显示自定义确认对话框
            return new Promise((resolve) => {
                new DeleteAttachmentModal(
                    this.app,
                    message,
                    // 确定回调：删除附件和笔记
                    async () => {
                        // 先删除附件
                        for (const attachment of attachments) {
                            try {
                                await this.app.vault.delete(attachment);
                            } catch (e) {
                                console.error('删除附件失败:', attachment.path, e);
                            }
                        }
                        new Notice(`已删除 ${attachments.length} 个附件文件`);
                        
                        // 删除笔记本身
                        await this.app.vault.delete(file);
                        resolve(true);
                    },
                    // 取消回调：只删除笔记，保留附件
                    async () => {
                        // 只删除笔记，保留附件
                        await this.app.vault.delete(file);
                        resolve(true);
                    }
                ).open();
            });
        } else {
            // 没有附件，直接删除笔记
            await this.app.vault.delete(file);
            return true;
        }
    }

    // 删除文件夹函数（带笔记提示）
    async deleteFolderWithNotes(folder) {
        // 只处理文件夹
        if (!(folder instanceof TFolder)) {
            return false;
        }

        // 获取文件夹中的所有笔记
        const notes = this.getNotesInFolder(folder);
        
        if (notes.length > 0 && this.settings.enableDeleteFolderPrompt) {
            // 构建笔记列表文本
            const noteNames = notes.slice(0, 5).map(f => f.basename).join('\n');
            const moreText = notes.length > 5 ? `\n... 还有 ${notes.length - 5} 篇笔记` : '';
            const message = `该文件夹包含 ${notes.length} 篇笔记：\n\n${noteNames}${moreText}\n\n请选择删除方式：`;
            
            // 显示自定义确认对话框
            return new Promise((resolve) => {
                new DeleteFolderModal(
                    this.app,
                    message,
                    notes.length,
                    // 删除全部回调：删除文件夹和所有笔记/附件
                    async () => {
                        let totalAttachments = 0;
                        
                        // 先删除所有笔记的附件
                        for (const note of notes) {
                            const attachments = this.getAllAttachments(note);
                            totalAttachments += attachments.length;
                            for (const attachment of attachments) {
                                try {
                                    await this.app.vault.delete(attachment);
                                } catch (e) {
                                    console.error('删除附件失败:', attachment.path, e);
                                }
                            }
                        }
                        
                        // 再删除所有笔记
                        for (const note of notes) {
                            try {
                                await this.app.vault.delete(note);
                            } catch (e) {
                                console.error('删除笔记失败:', note.path, e);
                            }
                        }
                        
                        // 最后删除文件夹
                        await this.app.vault.delete(folder);
                        
                        let noticeText = `已删除文件夹及 ${notes.length} 篇笔记`;
                        if (totalAttachments > 0) {
                            noticeText += `，${totalAttachments} 个附件`;
                        }
                        new Notice(noticeText);
                        resolve(true);
                    },
                    // 只删除文件夹回调：移动笔记到根目录
                    async () => {
                        // 移动所有笔记到根目录
                        for (const note of notes) {
                            try {
                                // 获取文件名（不包含路径）
                                const fileName = note.name;
                                // 检查根目录是否已有同名文件
                                let newPath = fileName;
                                let counter = 1;
                                while (this.app.vault.getAbstractFileByPath(newPath)) {
                                    const nameWithoutExt = note.basename;
                                    const ext = note.extension;
                                    newPath = `${nameWithoutExt}_${counter}.${ext}`;
                                    counter++;
                                }
                                // 移动文件到根目录
                                await this.app.vault.rename(note, newPath);
                            } catch (e) {
                                console.error('移动笔记失败:', note.path, e);
                            }
                        }
                        // 删除文件夹
                        await this.app.vault.delete(folder);
                        new Notice(`已删除文件夹，${notes.length} 篇笔记已移动到根目录`);
                        resolve(true);
                    }
                ).open();
            });
        } else if (notes.length > 0 && !this.settings.enableDeleteFolderPrompt) {
            // 禁用提示时，直接删除文件夹及其所有内容（包括笔记和附件）
            let totalAttachments = 0;
            
            // 先删除所有笔记的附件
            for (const note of notes) {
                const attachments = this.getAllAttachments(note);
                totalAttachments += attachments.length;
                for (const attachment of attachments) {
                    try {
                        await this.app.vault.delete(attachment);
                    } catch (e) {
                        console.error('删除附件失败:', attachment.path, e);
                    }
                }
            }
            
            // 再删除所有笔记
            for (const note of notes) {
                try {
                    await this.app.vault.delete(note);
                } catch (e) {
                    console.error('删除笔记失败:', note.path, e);
                }
            }
            
            // 最后删除文件夹
            await this.app.vault.delete(folder);
            return true;
        } else {
            // 没有笔记（空文件夹或只有非 markdown 文件），直接删除文件夹
            try {
                // 检查文件夹是否真的为空（包括所有文件类型）
                const allFilesInFolder = folder.children || [];
                if (allFilesInFolder.length === 0) {
                    // 文件夹完全为空，直接删除
                    await this.app.vault.delete(folder);
                    return true;
                } else {
                    // 文件夹中有其他文件（非 markdown），尝试删除文件夹
                    // Obsidian 的 delete 方法应该能处理这种情况
                    await this.app.vault.delete(folder);
                    return true;
                }
            } catch (e) {
                console.error('删除空文件夹失败:', folder.path, e);
                new Notice('删除文件夹失败: ' + (e.message || '未知错误'));
                return false;
            }
        }
    }

    // 查找包含指定文件的标签页
    findLeafWithFile(file) {
        const allLeaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of allLeaves) {
            const view = leaf.view;
            if (view && view.file && view.file.path === file.path) {
                return leaf;
            }
        }
        return null;
    }

    // 智能打开文件（根据设置决定打开方式）
    async smartOpenFile(file, event = null) {
        if (!(file instanceof TFile) || file.extension !== 'md') {
            // 非 markdown 文件，使用默认行为
            return;
        }

        // 检查是否按了 Ctrl/Cmd 键
        const isModKey = event ? Keymap.isModEvent(event) : false;

        let targetLeaf;
        if (isModKey) {
            // Ctrl+点击：强制在新标签页打开
            targetLeaf = this.app.workspace.getLeaf(true);
        } else if (this.settings.alwaysFocusCurrentTab) {
            // 始终聚焦当前标签页：始终在同一个标签页打开
            // 获取当前活动的 markdown 标签页
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.leaf) {
                targetLeaf = activeView.leaf;
            } else {
                // 没有活动标签页，使用当前活动标签页（如果不存在则创建新标签页）
                targetLeaf = this.app.workspace.getLeaf(false);
            }
        } else {
            // 关闭功能：每个笔记都在新标签页打开，但相同笔记只打开一个
            // 先检查文件是否已经在某个标签页打开
            const existingLeaf = this.findLeafWithFile(file);
            if (existingLeaf) {
                // 文件已经在某个标签页打开，切换到那个标签页
                targetLeaf = existingLeaf;
                // 激活该标签页
                this.app.workspace.setActiveLeaf(targetLeaf);
            } else {
                // 文件没有打开，创建新标签页
                targetLeaf = this.app.workspace.getLeaf(true);
            }
        }

        await targetLeaf.openFile(file);
    }

    async onload() {
        console.log('加载 laofan 插件');

        // 加载设置
        await this.loadSettings();

        // 注册视图
        this.registerView(VIEW_TYPE, (leaf) => new NotesListView(leaf, this));

        // 添加命令：打开笔记列表
        this.addCommand({
            id: 'open-notes-list',
            name: '打开笔记列表',
            callback: () => {
                this.activateView();
            }
        });

        // 拦截文件列表的点击事件
        this.app.workspace.onLayoutReady(() => {
            // 保存插件实例的引用
            const plugin = this;
            
            // 监听文件列表的点击事件
            const fileExplorer = document.querySelector('.nav-files-container');
            if (fileExplorer) {
                // 使用事件委托监听文件列表的点击
                const clickHandler = async (e) => {
                    const navFile = e.target.closest('.nav-file-title');
                    if (!navFile) return;

                    // 获取文件路径
                    const filePath = navFile.getAttribute('data-path');
                    if (!filePath) return;

                    const file = plugin.app.vault.getAbstractFileByPath(filePath);
                    if (!(file instanceof TFile) || file.extension !== 'md') {
                        return; // 只处理 markdown 文件
                    }

                    // 检查是否按了 Ctrl/Cmd 键
                    const isModKey = Keymap.isModEvent(e);

                    // 阻止默认行为
                    e.preventDefault();
                    e.stopPropagation();

                    // 确保读取最新的设置（从插件实例读取）
                    const alwaysFocusCurrentTab = plugin.settings.alwaysFocusCurrentTab;

                    let targetLeaf;
                    if (isModKey) {
                        // Ctrl+点击：强制在新标签页打开
                        targetLeaf = plugin.app.workspace.getLeaf(true);
                    } else if (alwaysFocusCurrentTab) {
                        // 始终聚焦当前标签页：始终在同一个标签页打开
                        const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
                        if (activeView && activeView.leaf) {
                            targetLeaf = activeView.leaf;
                        } else {
                            // 没有活动标签页，使用当前活动标签页（如果不存在则创建新标签页）
                            targetLeaf = plugin.app.workspace.getLeaf(false);
                        }
                    } else {
                        // 关闭功能：每个笔记都在新标签页打开，但相同笔记只打开一个
                        // 先检查文件是否已经在某个标签页打开
                        const existingLeaf = plugin.findLeafWithFile(file);
                        if (existingLeaf) {
                            // 文件已经在某个标签页打开，切换到那个标签页
                            targetLeaf = existingLeaf;
                            // 激活该标签页
                            plugin.app.workspace.setActiveLeaf(targetLeaf);
                        } else {
                            // 文件没有打开，创建新标签页
                            targetLeaf = plugin.app.workspace.getLeaf(true);
                        }
                    }

                    // 确保使用正确的标签页打开文件
                    if (targetLeaf) {
                        await targetLeaf.openFile(file);
                    }
                };

                fileExplorer.addEventListener('click', clickHandler, true);
                
                // 保存引用以便卸载时移除
                this.fileExplorerClickHandler = clickHandler;
            }
        });

        // 注册文件菜单事件，拦截删除操作
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file, source, leaf) => {
                // 处理 markdown 文件
                if (file instanceof TFile && file.extension === 'md') {
                    // 在菜单显示后，通过DOM操作拦截删除菜单项的点击
                    const checkAndIntercept = () => {
                        const menuEl = menu.dom;
                        if (!menuEl) {
                            setTimeout(checkAndIntercept, 10);
                            return;
                        }
                        
                        const menuItems = menuEl.querySelectorAll('.menu-item');
                        menuItems.forEach((menuItemEl) => {
                            // 检查是否已经处理过（避免重复绑定）
                            if (menuItemEl.dataset.laofanIntercepted === 'true') {
                                return;
                            }
                            
                            const titleEl = menuItemEl.querySelector('.menu-item-title');
                            const title = titleEl?.textContent?.trim();
                            
                            // 检查是否是删除菜单项
                            if (title === 'Delete' || title === '删除') {
                                // 标记为已处理
                                menuItemEl.dataset.laofanIntercepted = 'true';
                                
                                // 添加新的点击事件（在捕获阶段拦截）
                                menuItemEl.addEventListener('click', async (e) => {
                                    e.stopImmediatePropagation(); // 阻止其他事件监听器
                                    e.preventDefault();
                                    
                                    // 执行我们的删除逻辑
                                    await this.deleteFileWithAttachments(file);
                                    
                                    // 关闭菜单
                                    menu.hide();
                                }, true); // 使用捕获阶段以确保优先执行
                            }
                        });
                    };
                    
                    // 使用 requestAnimationFrame 确保DOM已渲染
                    requestAnimationFrame(() => {
                        checkAndIntercept();
                        // 如果第一次没找到，再尝试一次（菜单项可能延迟添加）
                        setTimeout(checkAndIntercept, 50);
                    });
                }
                // 处理文件夹
                else if (file instanceof TFolder) {
                    // 在菜单显示后，通过DOM操作拦截删除菜单项的点击
                    const checkAndIntercept = () => {
                        const menuEl = menu.dom;
                        if (!menuEl) {
                            setTimeout(checkAndIntercept, 10);
                            return;
                        }
                        
                        const menuItems = menuEl.querySelectorAll('.menu-item');
                        menuItems.forEach((menuItemEl) => {
                            // 检查是否已经处理过（避免重复绑定）
                            if (menuItemEl.dataset.laofanFolderIntercepted === 'true') {
                                return;
                            }
                            
                            const titleEl = menuItemEl.querySelector('.menu-item-title');
                            const title = titleEl?.textContent?.trim();
                            
                            // 检查是否是删除菜单项
                            if (title === 'Delete' || title === '删除') {
                                // 标记为已处理
                                menuItemEl.dataset.laofanFolderIntercepted = 'true';
                                
                                // 添加新的点击事件（在捕获阶段拦截）
                                menuItemEl.addEventListener('click', async (e) => {
                                    e.stopImmediatePropagation(); // 阻止其他事件监听器
                                    e.preventDefault();
                                    
                                    // 执行我们的删除文件夹逻辑
                                    await this.deleteFolderWithNotes(file);
                                    
                                    // 关闭菜单
                                    menu.hide();
                                }, true); // 使用捕获阶段以确保优先执行
                            }
                        });
                    };
                    
                    // 使用 requestAnimationFrame 确保DOM已渲染
                    requestAnimationFrame(() => {
                        checkAndIntercept();
                        // 如果第一次没找到，再尝试一次（菜单项可能延迟添加）
                        setTimeout(checkAndIntercept, 50);
                    });
                }
            })
        );

        // 添加设置标签页
        this.addSettingTab(new LaofanPluginSettingTab(this.app, this));

        // 如果左侧边栏没有打开，自动打开
        this.app.workspace.onLayoutReady(() => {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
            if (leaves.length === 0) {
                this.activateView();
            }
        });
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
        
        if (!leaf) {
            leaf = workspace.getLeftLeaf(false);
            await leaf.setViewState({ type: VIEW_TYPE });
        }
        
        workspace.revealLeaf(leaf);
    }

    onunload() {
        console.log('卸载 laofan 插件');
        
        // 移除文件列表的点击事件监听
        if (this.fileExplorerClickHandler && this.fileExplorerElement) {
            this.fileExplorerElement.removeEventListener('click', this.fileExplorerClickHandler, true);
        }
    }
}

class LaofanPluginSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        // 标题
        containerEl.createEl('h2', { text: 'Laofan Notes List 设置' });

        // 每页显示的笔记数量
        new Setting(containerEl)
            .setName('每页显示的笔记数量')
            .setDesc('设置每次加载显示的笔记数量（默认：20）')
            .addText(text => text
                .setPlaceholder('20')
                .setValue(String(this.plugin.settings.pageSize))
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.plugin.settings.pageSize = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        // 自动滚动到当前笔记
        new Setting(containerEl)
            .setName('自动滚动到当前笔记')
            .setDesc('打开笔记列表时，自动滚动到当前打开的笔记位置')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoScrollToActiveNote)
                .onChange(async (value) => {
                    this.plugin.settings.autoScrollToActiveNote = value;
                    await this.plugin.saveSettings();
                }));

        // 显示缩略图
        new Setting(containerEl)
            .setName('显示缩略图')
            .setDesc('在笔记列表中显示图片和文件的缩略图')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showThumbnails)
                .onChange(async (value) => {
                    this.plugin.settings.showThumbnails = value;
                    await this.plugin.saveSettings();
                    // 重新渲染列表以应用设置
                    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
                    leaves.forEach(leaf => {
                        if (leaf.view instanceof NotesListView) {
                            leaf.view.renderList();
                        }
                    });
                }));

        // 每个笔记最多显示的标签数量
        new Setting(containerEl)
            .setName('每个笔记最多显示的标签数量')
            .setDesc('设置每个笔记项中最多显示的标签数量（默认：3）')
            .addText(text => text
                .setPlaceholder('3')
                .setValue(String(this.plugin.settings.maxTagsDisplay))
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.plugin.settings.maxTagsDisplay = numValue;
                        await this.plugin.saveSettings();
                        // 重新渲染列表以应用设置
                        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
                        leaves.forEach(leaf => {
                            if (leaf.view instanceof NotesListView) {
                                leaf.view.renderList();
                            }
                        });
                    }
                }));

        // 启用删除附件提示
        new Setting(containerEl)
            .setName('启用删除附件提示')
            .setDesc('删除包含附件的笔记时，显示确认对话框询问是否同时删除附件')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableDeleteAttachmentPrompt)
                .onChange(async (value) => {
                    this.plugin.settings.enableDeleteAttachmentPrompt = value;
                    await this.plugin.saveSettings();
                }));

        // 启用删除文件夹提示
        new Setting(containerEl)
            .setName('启用删除文件夹提示')
            .setDesc('删除包含笔记的文件夹时，显示确认对话框询问删除方式（只删除文件夹或删除全部笔记/附件）')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableDeleteFolderPrompt)
                .onChange(async (value) => {
                    this.plugin.settings.enableDeleteFolderPrompt = value;
                    await this.plugin.saveSettings();
                }));

        // 显示时间提示
        new Setting(containerEl)
            .setName('显示时间提示')
            .setDesc('鼠标悬停在笔记项上时，显示创建时间和最后修改时间的提示')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showTimeTooltip)
                .onChange(async (value) => {
                    this.plugin.settings.showTimeTooltip = value;
                    await this.plugin.saveSettings();
                    // 重新渲染列表以应用设置
                    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
                    leaves.forEach(leaf => {
                        if (leaf.view instanceof NotesListView) {
                            leaf.view.renderList();
                        }
                    });
                }));

        // 始终聚焦当前标签页
        new Setting(containerEl)
            .setName('始终聚焦当前标签页')
            .setDesc('启用后，笔记会在同一个标签页打开；如果标签页被关闭，下次点击会在新标签页打开。Ctrl+点击可强制在新标签页打开。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.alwaysFocusCurrentTab)
                .onChange(async (value) => {
                    this.plugin.settings.alwaysFocusCurrentTab = value;
                    await this.plugin.saveSettings();
                    // 更新所有视图的设置
                    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
                    leaves.forEach(leaf => {
                        if (leaf.view instanceof NotesListView) {
                            leaf.view.updateSettings(this.plugin.settings);
                        }
                    });
                }));

        // 分隔线
        containerEl.createEl('hr');

        // 关于信息
        const aboutContainer = containerEl.createDiv('laofan-settings-about');
        aboutContainer.createEl('h3', { text: '关于' });
        aboutContainer.createEl('p', { 
            text: 'Laofan Notes List - 显示纯笔记列表，按最新修改时间排序，类似微信收藏样式。'
        });
        const manifest = this.plugin.manifest || { version: '1.0.0', author: 'Laofan' };
        aboutContainer.createEl('p', { 
            text: `版本: ${manifest.version}` 
        });
        aboutContainer.createEl('p', { 
            text: `作者: ${manifest.author}` 
        });
    }
}

module.exports = LaofanPlugin;

