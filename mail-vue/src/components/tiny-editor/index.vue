<template>
  <div class="editor-box">
    <div class="editor-status" v-if="showLoading || failed" role="status">
      <loading v-if="showLoading"/>
      <el-button v-else @click="initTinyMCE">{{ $t('retry') }}</el-button>
    </div>
    <textarea :id="editorId" ref="editorRef" :aria-label="$t('editorContent')"></textarea>
  </div>
</template>

<script setup>
import {ref, onMounted, onBeforeUnmount, watch, nextTick, shallowRef, defineEmits, computed} from 'vue';
import loading from "@/components/loading/index.vue";
import {useI18n} from 'vue-i18n'
import {useUiStore} from '@/store/ui.js'
import {useSettingStore} from '@/store/setting.js'

defineExpose({
  clearEditor,
  focus,
  getContent
})

const props = defineProps({
  defValue: {
    type: String,
    default: ''
  },
  editorId: {
    type: String,
    default: () => `editor-${Date.now()}`
  }
});


const {locale} = useI18n()
const emit = defineEmits(['change','focus']);
const editor = shallowRef(null);
const isInitialized = ref(false);
const editorRef = ref(null);
const showLoading = ref(false);
const failed = ref(false);
const content = ref(props.defValue);
let disposed = false;
let generation = 0;
let focusRequested = false;
let loader;
const uiStore = useUiStore();
const settingStore = useSettingStore();

onMounted(() => {
  initTinyMCE();
});

onBeforeUnmount(() => {
  disposed = true;
  generation++;
  loader?.remove();
  destroyEditor();
});

watch(() => props.defValue, (newValue) => {
  content.value = newValue;
  if (editor.value && editor.value.getContent() !== newValue) {
    editor.value.setContent(newValue);
  }
});

watch(() => [uiStore.dark, settingStore.lang], () => {
  content.value = getContent();
  destroyEditor();
  initTinyMCE();
});

const language = computed(() => {
  if (locale.value === 'zh') {
    return 'zh_CN'
  }

  return 'en'
})

function clearEditor() {
  content.value = '';
  if (editor.value) {
    editor.value.setContent('');
  }
}

async function initTinyMCE() {
  const current = ++generation;
  showLoading.value = true;
  failed.value = false;
  try {
    if (!window.tinymce) {
      await new Promise((resolve, reject) => {
        loader?.remove();
        loader = document.createElement('script');
        loader.src = '/tinymce/tinymce.min.js';
        loader.onload = resolve;
        loader.onerror = reject;
        document.head.appendChild(loader);
      });
    }
    if (disposed || current !== generation) return;
    await nextTick();
    await initEditor(current);
  } catch {
    if (!disposed && current === generation) {
      failed.value = true;
      showLoading.value = false;
    }
  }
}

function initEditor(current) {
  return window.tinymce.init({
    selector: `#${props.editorId}`,
    statusbar: false,
    height: "100%",
    //relative_urls: false,  //阻止 img标签域名和网站域名相同 自动把链接转换相对路径
    //remove_script_host: false, // 阻止删除 URL 中的域名
    forced_root_block: 'div',
    skin: `${uiStore.dark ? 'oxide-dark' : 'oxide'}`,
    content_css: `/tinymce/css/index.css,${uiStore.dark ? 'dark' : 'default'}`,
    content_style: `:root {
         --scrollbar-track-color: ${uiStore.dark ? '#141414' : '#FFFFFF'};
         --scrollbar-thumb-color: ${uiStore.dark ? '#8D9095' : '#A8ABB2'};
    }
    body { font-size: 16px; }`,
    plugins: 'link image advlist lists  emoticons fullscreen  table preview code',
    toolbar: 'bold italic | fontsize | forecolor backcolor | bullist numlist | link image | alignleft aligncenter alignright alignjustify | outdent indent | table emoticons code preview fullscreen',
    toolbar_mode: 'sliding',
    mobile: { toolbar_mode: 'sliding' },
    font_size_formats: '8px 10px 12px 14px 16px 18px 24px 36px',
    emoticons_search: false,
    language: language.value,
    language_load: true,
    menubar: false,
    license_key: 'gpl',
    noneditable_class: 'mceNonEditable',
    setup: (ed) => {
      editor.value = ed;
      ed.on('init', () => {
        if (disposed || current !== generation) {
          ed.remove();
          return;
        }
        ed.setContent(content.value);
        isInitialized.value = true;
        showLoading.value = false;
        if (focusRequested) ed.focus();
      });
      ed.on('input change', () => {
        content.value = ed.getContent();
        const text = ed.getContent({format: 'text'});
        emit('change', content.value, text);
      });
      ed.on('focus', () => {
        emit('focus', focus);
      })
    },
    branding: false,
    file_picker_types: 'image',
    image_dimensions: false,
    image_description: false,
    link_title: false,
    dialog_type: 'none',
    file_picker_callback: (callback, value, meta) => {
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.setAttribute('accept', 'image/*');

      input.addEventListener('change', async (e) => {
        let file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const id = 'blobid' + (new Date()).getTime();
          if (!editor.value || disposed) return;
          const blobCache = editor.value.editorUpload.blobCache;
          const base64 = reader.result.split(',')[1];
          const blobInfo = blobCache.create(id, file, base64);
          blobCache.add(blobInfo);

          callback(blobInfo.blobUri(), {title: file.name});
        }
        reader.readAsDataURL(file);
      });

      input.click();
    }
  });
}

function focus() {
  focusRequested = true;
  nextTick(() => {
    if (isInitialized.value) editor.value?.focus()
  })
}

function getContent() {
  return isInitialized.value ? editor.value.getContent() : content.value
}


function destroyEditor() {
  isInitialized.value = false;
  if (editor.value) {
    editor.value.destroy();
    editor.value = null;
  }
}
</script>

<style lang="scss" scoped>
.editor-box {
  position: relative;
  min-height: 0;
  min-width: 0;
  height: 100%;
  width: 100%;
}

.editor-status {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: var(--el-bg-color);
  display: flex;
  align-items: center;
  justify-content: center;
}

textarea { width: 100%; height: 100%; box-sizing: border-box; }

@media (pointer: coarse), (max-width: 767px) {
  :deep(.tox-tbtn) { min-width: 44px; min-height: 44px; }
}

:deep(.tox-tbtn.tox-tbtn--select.tox-tbtn--bespoke) {
  width: 80px !important;
}

:deep(.tox.tox-tinymce.tox-fullscreen) {
  padding-right: 15px;
  padding-left: 15px;
  padding-bottom: 15px;
  background: var(--el-bg-color);
  @media (max-width: 767px) {
    padding-right: 10px;
    padding-left: 10px;
    padding-bottom: 10px;
  }
}

:deep(.tox-tinymce) {
  border: none;
  border-radius: 0;
}

:deep(.tox-toolbar__group) {
  padding-left: 0 !important;
  margin: 0 !important;
}

:deep(.tox-tbtn) {
  margin: 0 !important;
}

:deep(.tox .tox-edit-area::before) {
  display: none;
}

</style>
