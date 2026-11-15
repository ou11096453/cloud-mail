<template>
  <emailScroll ref="scroll"
               :allow-star="false"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               @jump="jumpContent"
               actionLeft="6px"
               :show-account-icon="false"
               :show-first-loading="false"
               :showStar="false"
               @delete-draft="deleteDraft"
               :type="'draft'"
  >
    <template #name="props">
      <span class="send-email">{{ props.email.receiveEmail?.join(',') || '(' + $t('noRecipient') + ')' }}</span>
    </template>
    <template #subject="props">
      {{ props.email.subject || '(' + $t('noSubject') + ')' }}
    </template>
  </emailScroll>
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import {emailDelete} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, ref, watch, toRaw} from "vue";
import {useUiStore} from "@/store/ui.js";
import {userDraftStore} from "@/store/draft.js";
import {useI18n} from "vue-i18n";
import db from "@/db/db.js"

defineOptions({
  name: 'draft'
})

const draftStore = userDraftStore();
const uiStore = useUiStore();
const {t} = useI18n();
const scroll = ref({})

watch(() => draftStore.setDraft, async () => {

  const draft = {...toRaw(draftStore.setDraft)}
  const draftId = draft.draftId
  if (!draftId) return;
  const attachments = toRaw(draft.attachments || [])

  delete draft.draftId
  delete draft.attachments

  try {
    await db.value.transaction('rw', db.value.draft, db.value.att, async () => {
      if (!draft.content && !draft.subject && !draft.receiveEmail?.length) {
        await db.value.draft.delete(draftId);
        await db.value.att.delete(draftId);
      } else {
        await db.value.draft.update(draftId, draft);
        await db.value.att.put({draftId, attachments});
      }
    });
    draftStore.refreshList++
  } catch {
    ElMessage({ message: t('reqFailErrorMsg'), type: 'error', plain: true });
  }
})

watch(() => draftStore.refreshList, () => {
  scroll.value.refreshList();
})

async function getEmailList() {
  const list = await db.value.draft.orderBy('createTime').reverse().toArray();
  return {list, total: list.length};
}

async function deleteDraft(draftIds) {
  try {
    await db.value.transaction('rw', db.value.draft, db.value.att, async () => {
      await db.value.draft.bulkDelete(draftIds);
      await db.value.att.bulkDelete(draftIds);
    });
    draftStore.refreshList++
  } catch {
    ElMessage({ message: t('reqFailErrorMsg'), type: 'error', plain: true });
  }
}

async function jumpContent(email) {
  const att = await db.value.att.get(email.draftId)
  email.attachments = att?.attachments || []
  uiStore.writerRef.openDraft(email);
}

</script>
<style>
.send-email {
  font-weight: normal;
}
</style>
