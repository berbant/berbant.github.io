import { sentRecording } from "./connections.js";
import { mic } from "./microphone.js";
const { ref, onBeforeUnmount } = Vue

const app = Vue.createApp({
  setup() {

    // --- Состояние аудио компонента  ---
    const isRecording = ref(false); // Отслеживаем, идет ли запись
    const isPlaying = ref(false); // Отслеживаем, проигрывается ли аудио
    const isUploading = ref(false); // Отслеживаем процесс отправки
    const audioBlob = ref(null);   // Blob URL аудио-записи для воспроизведения и отправки
    const audioUrl = ref(null);   // уникальная ссылка на аудио блоб только для локального браузера

    // Событие размонтирования компонента
    onBeforeUnmount(() => {
      mic.clearAudioObjects(audioUrl); // Очистка аудио (хорошая практика)
    });

    return {
      // blob audio url
      audioUrl,
      // 1. НАЧАТЬ ЗАПИСЬ
      isRecording,
      startRecording: () => mic.startVAD(audioUrl, audioBlob, isRecording),
      // 2. ОСТАНОВИТЬ ЗАПИСЬ
      stopRecording: () => mic.stopVAD(isRecording), //mic.stopRecording(),
      // 3. ВОСПРОИЗВЕСТИ ЗАПИСЬ
      isPlaying,
      playRecording: () => mic.playRecording(audioUrl, isPlaying),
      // 4. СКАЧАТЬ ЗАПИСЬ
      downloadRecording: () => mic.downloadRecording(audioUrl),
      // 5. ОТПРАВИТЬ ЗАПИСЬ
      isUploading,
      sentRecording: () => sentRecording(audioUrl, audioBlob, isUploading)
    }
  }
})

app.use(Quasar)
app.mount('#q-app')


