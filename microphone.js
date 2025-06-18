// Переменные вне реактивности Vue
let vadInstance = null; // объект VAD для распознавания речи
let mediaRecorder = null; // объект "диктофон" для записи аудио
let audioChunks = []; // массив для хранения "кусков" аудио
let audioStream = null; // объект потока аудио
let audioPlayer = null; // объект Audio для воспроизведения записи

export const mic = {

  // инициализации Voice Activity Detector (VAD)
  async startVAD(audioUrl, audioBlob, isRecording) {
    try {
      isRecording.value = true; // блокируем кнопку записи
      console.log('Загрузка модели VAD...');

      // Иннициализация VAD для распознавания речи
      // vad.MicVAD.new() является асинхронной фабрикой, которая
      //   запрашивает доступ к микрофону.
      //   !cкачивает модель VAD (silero_vad.onnx) с CDN каждую иннициализацию (блокируется CORS после начиная с 0.20 версии)
      //     !нужно будет узнать у нейронки как работает этот onnx и нахрена он каждый раз скачивается
      //     !нужно спросить почему он заданную пустоту в 0.6 сек. после фразы отдает в WAV
      //   сам создает и настраивает new AudioContext();
      //   Возвращает готовый к работе экземпляр vadInstance.
      vadInstance = await vad.MicVAD.new({
        // Если это подставить и скачивать со своего сервера то может CORS не будет?
        // URL к вашей локальной копии модели
        // https://github.com/snakers4/silero-vad?tab=readme-ov-file
        // modelURL: "/models/silero_vad.onnx",
        // Путь к вашему локальному WASM-файлу ONNX Runtime
        // ? в npm можно поискать
        // onnxWasmPath: "/models/onnxruntime-web.wasm",
        
        // VAD задержка перед концом речи (в секундах)
        // defaul = 8 (250 мс) пусть будет 19 (0.6 сек)
        redemptionFrames: Math.round(0.7 * 1000 / 32),
        // VAD уверенность в том, что это речь (от negativeSpeechThreshold до 1; 0.5 - по умолчанию)
        positiveSpeechThreshold: 0.8,
        // буферная зона между тишиной и началом речи (от 0 до positiveSpeechThreshold; 0.35 - по умолчанию)
        // вроде её не нужно менять (борьба с ложными срабатываниями?)
        negativeSpeechThreshold: 0.35,

        // Событие для обратной связи, когда речь началась
        onSpeechStart: () => console.log("Речь началась"),

        // Событие, которое срабатывает, когда пользователь перестал говорить.
        // отдаёт `audio` - Float32Array с аудиоданными (частота дискретизации 16000 Гц).
        onSpeechEnd: (audio) => {
          console.log(`Речь окончена. Аудио-сегмент, длительность: ${audio.length / 16000} сек.`);

          // Преобразуем сырые данные в WAV-файл (Blob)
          // отрезая последние 2 сек. которые vad-web всегда оставляет в конце
          // Можно конвертировать в webm на лету (с помощью MediaRecorder) но...
          // - усложняется код (нужно делать непрерывную запись и давать пред буферизацию до начала первой фразы)
          // - плюс аудиоплеер это не воспроизводит и transcriber не принимает
          // возможно в других библиотеках можно попроще это сделать
          audioBlob.value = encodeWAV(audio, 2);

          // Создаем ссылку для плеера и для скачивания (работает только локально в браузере)
          audioUrl.value = URL.createObjectURL(audioBlob.value);
          console.log('Ссылка на сегмент аудио. URL:', audioUrl.value)

          // --> ЗДЕСЬ ВАШ КОД ДЛЯ ОТПРАВКИ ФАЙЛА НА СЕРВЕР <--
          // sendAudioToServer(wavBlob);
          // пока это simulate a delay
          console.log('Отправляем аудио на сервер...')
          vadInstance.pause();
          setTimeout(() => {
            vadInstance.start();
            console.log('типа отправили.')
          }, 1000)
        },

      });

      // Запускаем распознавание речи
      vadInstance.start();
      console.log('VAD загружен. Начинаем детекцию речи...');

    } catch (error) {
      console.error("Ошибка при инициализации VAD:", error);
      isRecording.value = false; // разблокируем кнопку записи
    }

  },

  stopVAD(isRecording) {
    console.log('Отключаем микрофон...');

    // 1. Ставим на паузу, чтобы остановить обработку
    vadInstance.pause();

    // 2. Получаем поток и останавливаем ВСЕ его дорожки. Микрофон отключается.
    audioStream = vadInstance.stream;
    if (audioStream) audioStream.getTracks().forEach(track => track.stop());

    // Убираем ссылку на инстанс. Теперь сборщик мусора JavaScript
    // может безопасно очистить память, занятую объектом и его внутренними компонентами (AudioContext и т.д.).
    vadInstance = null;
    isRecording.value = false; // разблокируем кнопку записи

  },

  // Воспроизвести запись или поставить на паузу (вроде даже различает разные треки/URL)
  playRecording(audioUrl, isPlaying) {
    const isNewAudio = !audioPlayer || audioPlayer.src !== audioUrl.value;

    // Если это новый трек, создаем и настраиваем плеер
    if (isNewAudio) {
      if (audioPlayer) {
        audioPlayer.pause();
      }
      // Создаем новый экземпляр Audio 
      // здесь определяется audioPlayer.src
      audioPlayer = new Audio(audioUrl.value);

      // Обработчики
      audioPlayer.onpause = () => { console.log('Пауза...'); isPlaying.value = false; }
      audioPlayer.onended = () => { console.log('Воспроизведение завершено.'); isPlaying.value = false; }
      audioPlayer.onerror = (e) => { console.error("Ошибка плеера:", e); isPlaying.value = false; }
    }

    // Основная логика: пауза или воспроизведение
    if (!audioPlayer.paused) {
      // Если уже играет (и это тот же самый трек) - ставим на паузу
      audioPlayer.pause();
    } else {
      // Если на паузе или это новый трек - запускаем
      console.log('Воспроизведение...');
      const playPromise = audioPlayer.play();

      if (playPromise !== undefined) {
        playPromise.then(() => {
          // Воспроизведение успешно началось
          isPlaying.value = true;
        }).catch(error => {
          // Ошибка, например, пользователь не взаимодействовал со страницей
          console.error("Ошибка воспроизведения:", error);
          isPlaying.value = false;
        });
      }
    }
  },

  // Скачать запись
  downloadRecording(audioUrl) {
    // Если blob URL аудио пустой, выходим 
    if (!audioUrl.value) return;

    // 1. Создаем временную ссылку <a>
    const link = document.createElement('a');

    // 2. Устанавливаем ее href на blob URL
    link.href = audioUrl.value;

    // 3. Устанавливаем атрибут download и имя файла
    // Расширение файла должно соответствовать mimeType!
    //const fileExtension = supportedMimeType.split('/')[1].split(';')[0]; // Получаем 'mp4' или 'webm'
    const fileExtension = 'wav';
    link.download = `recording-${new Date().toISOString()}.${fileExtension}`;

    // 4. Программно "кликаем" по ссылке, чтобы начать скачивание
    document.body.appendChild(link); // Ссылка должна быть в DOM браузера
    link.click();

    // 5. Удаляем временную ссылку
    document.body.removeChild(link);
  },



  // Начать обычную запись с микрофона
  async startRecording(audioUrl, audioBlob, isRecording) {
    if (!supportedMimeType) {
      console.error('Ни один из указанных mimeType не поддерживается.');
      return
    }
    console.log('Поддерживаемый mimeType: ', supportedMimeType,);
    try {
      // Запрашиваем доступ к микрофону и получаем/подключаемся к потоку его аудио
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Создаём диктофон и подключаем его к потоку аудио, чтобы быть готовым к записи аудио
      mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: supportedMimeType,
        audio: {
          // Рекомендуемые настройки для VAD
          noiseSuppression: true,
          echoCancellation: true
        },
        video: false,
      });

      // Начинаем запись
      mediaRecorder.start();
      isRecording.value = true; // Обновляем UI
      console.log('Идет запись...')

      // Собираем "куски" аудио
      audioChunks = [];
      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
      };

      // Событие, которое сработает при остановке записи
      audioUrl.value = null; // Сбрасываем предыдущую запись, если она была
      mediaRecorder.onstop = () => {
        audioBlob.value = new Blob(audioChunks, { type: supportedMimeType });
        // Если старый URL был, его нужно освободить, чтобы избежать утечек памяти
        if (audioUrl.value) {
          URL.revokeObjectURL(audioUrl.value);
        }

        audioUrl.value = URL.createObjectURL(audioBlob.value); // Сохраняем URL в нашем состоянии
        isRecording.value = false;
        console.log('Запись завершена. URL:', audioUrl.value)

        // Отключаем микрофон после записи (Отключаем дорожки микрофона)
        audioStream.getTracks().forEach(track => track.stop());
      };

    } catch (err) {
      console.error('Ошибка доступа к микрофону:', err);
    }
  },

  // Остановить обычную запись с микрофона
  stopRecording() {
    if (mediaRecorder) {
      mediaRecorder.stop(); // Это вызовет событие onstop, которое мы определили выше
    }
  },

  // Очистка аудио компонентов (при размонтировании компонента)
  clearAudioObjects(audioUrl) {
    // Освобождаем URL, если он был создан
    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value);
    }
    // Останавливаем все дорожки микрофона от обычной записи (не VAD)
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
    }
  }

}

// Список предпочтительных audio форматов.
const mimeTypes = [
  'audio/mp4', // Для Safari
  'audio/webm;codecs=opus', // Качественный кодек для Chrome/Firefox
  'audio/webm',
  'audio/avc1'
];
// Находим первый поддерживаемый тип кодека из списка поддерживаемых браузером
const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

/**
 * Кодирует Float32Array в WAV Blob.
 * @param {Float32Array} samples - Аудиоданные с частотой 16000 Гц.
 * @returns {Blob} - WAV файл в виде Blob.
 * writeString - ???функция для записи строки в DataView.
 * trimEndSeconds - время в секундах, которое нужно удалить с конца аудио.
 */
//function encodeWAV(samples) { function writeString(view, offset, string) { for (let i = 0; i < string.length; i++) { view.setUint8(offset + i, string.charCodeAt(i)); } } const sampleRate = 16000, buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer); writeString(view, 0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, !0); writeString(view, 8, 'WAVE'); writeString(view, 12, 'fmt '); view.setUint32(16, 16, !0); view.setUint16(20, 1, !0); view.setUint16(22, 1, !0); view.setUint32(24, sampleRate, !0); view.setUint32(28, 32e3, !0); view.setUint16(32, 2, !0); view.setUint16(34, 16, !0); writeString(view, 36, 'data'); view.setUint32(40, 2 * samples.length, !0); let offset = 44; for (let i = 0; i < samples.length; i++, offset += 2) { let s = Math.max(-1, Math.min(1, samples[i])); view.setInt16(offset, s < 0 ? 32768 * s : 32767 * s, !0) } return new Blob([view], { type: 'audio/wav' }) }
function encodeWAV(samples, trimEndSeconds = 0) {

  const sampleRate = 16000; // аудио содержит 16000 сэмплов в секунду (частота дискретизации = 16 кГц)

  if (trimEndSeconds > 0) {
    // Рассчитываем кол-во сэмплов для удаления соответствующих кол-ву секунд trimEndSeconds
    const samplesToRemove = Math.floor(sampleRate * trimEndSeconds);
    // Убедимся, что аудио длиннее, чем время, которое мы хотим удалить  
    if (samples.length > samplesToRemove) {
      // Создаем новый, укороченный массив сэмплов без последних trimEndSeconds секунд
      samples = samples.slice(0, samples.length - samplesToRemove);
      // Если аудио слишком короткое, можно ничего не делать,
    }

    // Вспомогательная функция для записи строки в DataView
    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    // sampleRate уже определен выше
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF-чанк
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');

    // "fmt " саб-чанк
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);

    // "data" саб-чанк
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Запись аудиоданных
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }
}
