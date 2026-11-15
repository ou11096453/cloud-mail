<template>
  <iframe
      ref="frame"
      class="content-frame"
      :title="$t('editorContent')"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerpolicy="no-referrer"
      :srcdoc="documentHtml"
      :style="{ height: height + 'px' }"
      @load="observeContent"
  ></iframe>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { emailFrameDocument } from '@/utils/email-html.js'

const props = defineProps({
  html: {
    type: String,
    default: ''
  }
})

const frame = ref(null)
const height = ref(160)
const documentHtml = computed(() => emailFrameDocument(props.html))
let observer

function observeContent() {
  observer?.disconnect()
  const doc = frame.value?.contentDocument
  if (!doc?.body) return
  const resize = () => {
    // Body height excludes the iframe viewport, so content can also shrink.
    height.value = Math.min(20000, Math.max(80, Math.ceil(doc.body.getBoundingClientRect().height) + 24))
  }
  observer = new ResizeObserver(resize)
  observer.observe(doc.body)
  resize()
}

onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.content-frame {
  display: block;
  width: 100%;
  max-width: 100%;
  border: 0;
  background: #fff;
}
</style>
