'use strict';
const translations={
  "en": {
    "hero": "Reset forecasts and quota, together.",
    "intro": "Follow reset announcements from five websites alongside your remaining Codex quota. When a reset time is announced, use it to plan how much to spend before then.",
    "eyebrow": "CODEX RESET FORECAST DASHBOARD · WINDOWS",
    "download": "Download for Windows",
    "code": "View on GitHub ↗",
    "meta": "Windows 10/11 · English and Chinese · GPL-3.0",
    "startEyebrow": "INSTALLATION",
    "installTitle": "Get the dashboard running.",
    "step1": "Download the installer or portable version from Releases.",
    "step2": "Open the dashboard to see reset announcements. Choose your language and text size in Settings.",
    "step3": "To show personal quota, install the official Codex CLI and sign in with codex login.",
    "installNote": "The installation guide covers CLI setup, Windows publisher prompts and where settings are saved.",
    "guide": "Installation guide ↗",
    "privacyLink": "Privacy",
    "issues": "Report an issue",
    "features": [
      [
        "A reset is announced. The dashboard turns orange.",
        "The usual green view turns orange when an automatic reset is announced for your plan with a specific time. The countdown and red target line appear together, so you can see how long you have to use your remaining quota."
      ],
      [
        "Compare your usage with two pacing guides.",
        "Three bars show actual consumption, an assumed X-day reset cycle and even usage across your personal cycle. X defaults to 3 days. Drag the bars to change their order."
      ],
      [
        "Keep pace with the red line.",
        "The line moves right with time and reaches 100% at the announced reset time. Compare it with actual consumption to see how your usage is keeping up. Matching times use one line; different times form two lines with a red band between them."
      ],
      [
        "Read five sources side by side.",
        "Each card shows the next expected reset time, the original announcement and when the source was updated. Open the details to compare posts. Cards show “None” when there is no active forecast."
      ],
      [
        "See when each source recorded a reset.",
        "The latest reset and elapsed time sit at the top. History runs from September 2026, newest first. Expand a record to compare the timestamps, original posts and shared feeds behind it. Times use Beijing time."
      ],
      [
        "Set it up once. Leave it in the tray.",
        "Choose English or Chinese, adjust text size and enable startup with Windows. Scheduled automatic resets for your plan get a notification you can acknowledge; messages about similar reset times are grouped together."
      ]
    ],
    "captions": [
      "Left: routine mode. Right: a timed reset announcement.",
      "Actual consumption, a custom reset cycle and personal-cycle pacing.",
      "Left: one reset time. Right: a range of reset times.",
      "Codex Reset · Did Codex Reset · NextReset · TIBO · Codex Reset Today",
      "Expand a history row to compare each source’s timestamp.",
      "Language, text size, startup and notification settings."
    ]
  },
  "zh-CN": {
    "hero": "重置预告、剩余额度，放在一起。",
    "intro": "汇总五个网站的重置预告，显示本机 Codex 剩余额度。有了具体重置时间，就按这个时间安排接下来的使用。",
    "eyebrow": "CODEX 重置预测看板 · WINDOWS",
    "download": "下载 Windows 版",
    "code": "在 GitHub 查看 ↗",
    "meta": "Windows 10/11 · 软件中英双语 · GPL-3.0",
    "startEyebrow": "安装",
    "installTitle": "下载后，打开看板。",
    "step1": "在 Releases 选择安装版或便携版。",
    "step2": "打开即可查看重置消息，在设置中选择语言和字号。",
    "step3": "要显示个人额度，安装官方 Codex CLI，并用 codex login 登录。",
    "installNote": "CLI 安装方法、Windows 发布者提示和设置保存位置见安装说明。",
    "guide": "安装说明 ↗",
    "privacyLink": "隐私说明",
    "issues": "反馈问题",
    "features": [
      [
        "有重置预告时，看板变成橙色。",
        "平时是黑绿色调。你的套餐有了定时的自动重置预告后，界面切换为黑橙色，倒计时和红色目标线一起出现。距离重置还有多久、剩余额度该怎么用，打开就能看。"
      ],
      [
        "用了多少，和计划比一比。",
        "三条横条分别显示实际消耗、假设每 X 天重置的节奏，以及个人周期内的均匀节奏。X 默认 3 天，可以手动改；横条可以拖动，按你习惯的顺序排列。"
      ],
      [
        "跟着红色“游泳线”安排消耗。",
        "红线随时间向右推进，在预告重置时刻到达 100%。和实际消耗对照，就能看出使用进度。同一时间画一条线；不同时间画两条线，中间用红色荧光标出范围。"
      ],
      [
        "五个网站的消息，横着看。",
        "每个信源各占一列，上面是下次预计时间，下面是原帖和更新状态。点击展开详情，直接比对各站的说法；没有有效预告时，时间位置显示“无”。"
      ],
      [
        "上次什么时候重置，各站怎么记的。",
        "顶部显示最近一次重置和距今时长。下方历史从 2026 年 9 月开始，最新记录在最上面。展开一条记录，就能比较各站时间、原帖和共用来源；时间统一为北京时间。"
      ],
      [
        "设好字号，放到托盘继续看。",
        "界面可切换中英文，正文和小字一起缩放。支持开机启动、关闭至托盘。适用当前套餐的定时自动重置预告会发出持续通知，相近时间的消息合并，点“确认收到”关闭。"
      ]
    ],
    "captions": [
      "左：常规模式。右：出现具体时间的重置预告。",
      "实际消耗、自定义重置周期、个人周期均匀节奏。",
      "左：一个重置时间。右：多个时间形成的范围。",
      "Codex Reset · Did Codex Reset · NextReset · TIBO · Codex Reset Today",
      "展开历史记录，逐站比较时间和原帖。",
      "语言、字号、开机启动与通知设置。"
    ]
  },
  "ja": {
    "hero": "リセット予告と残り利用枠を、一緒に。",
    "intro": "5つのサイトのリセット予告と、Codex の残り利用枠を表示。予告時刻を見ながら、それまでの使い方を決められます。",
    "eyebrow": "CODEX RESET FORECAST DASHBOARD · WINDOWS",
    "download": "Windows 版をダウンロード",
    "code": "GitHub で見る ↗",
    "meta": "Windows 10/11 · アプリは英語・中国語 · GPL-3.0",
    "startEyebrow": "インストール",
    "installTitle": "ダウンロードして起動。",
    "step1": "Releases でインストーラーかポータブル版を選びます。",
    "step2": "起動するとリセット情報を確認できます。設定で言語と文字サイズを選べます。",
    "step3": "個人の利用枠を表示するには公式 Codex CLI をインストールし、codex login でログインします。",
    "installNote": "CLI の導入、Windows の発行元表示、設定の保存場所はインストールガイドにあります。",
    "guide": "インストールガイド ↗",
    "privacyLink": "プライバシー",
    "issues": "問題を報告",
    "features": [
      [
        "時刻付きの予告が出ると、オレンジに。",
        "通常は黒と緑。利用中のプランに時刻付きの自動リセット予告が出るとオレンジに変わり、カウントダウンと赤い目標線が表示されます。残り時間と利用枠を一緒に確認できます。"
      ],
      [
        "実際の使用量を、2つのペースと比較。",
        "実際の消費、X日でリセットする仮定、個人周期での均等ペースを3本のバーで表示。Xは初期値3日で変更でき、バーはドラッグで並べ替えられます。"
      ],
      [
        "赤い線に合わせて使う。",
        "線は時間とともに右へ進み、予告時刻に100%へ到達します。実際の消費量と並べて進み具合を確認できます。同じ時刻は1本、異なる時刻は2本と赤い帯で表示します。"
      ],
      [
        "5サイトの投稿を横に並べる。",
        "各カードに次の予告時刻、元の投稿、更新時刻を表示。詳細を開いて内容を比べられます。有効な予告がなければ「None」と表示します。"
      ],
      [
        "各サイトが記録した時刻を比べる。",
        "上部に直近のリセットと経過時間を表示。2026年9月以降の履歴は新しい順です。行を開くと時刻、元の投稿、共通の取得元を確認できます。時刻は北京時間です。"
      ],
      [
        "文字を調整して、トレイで監視。",
        "英語・中国語を選び、本文と小さな文字をまとめて調整できます。Windows起動時に立ち上げ、トレイで監視を継続。利用中のプランの時刻付き自動リセット予告は通知し、近い時刻の通知はまとめます。"
      ]
    ],
    "captions": [
      "左：通常。右：時刻付きの予告。",
      "実際の消費、指定周期、個人周期の均等ペース。",
      "左：1つの時刻。右：複数の時刻の範囲。",
      "Codex Reset · Did Codex Reset · NextReset · TIBO · Codex Reset Today",
      "履歴を開いて各サイトの時刻と投稿を比較。",
      "言語、文字サイズ、自動起動、通知の設定。"
    ]
  },
  "es": {
    "hero": "Previsiones de reinicio y cuota, juntas.",
    "intro": "Consulta los anuncios de cinco sitios junto a tu cuota restante de Codex. Cuando se publica una hora, puedes organizar el consumo hasta ese momento.",
    "eyebrow": "CODEX RESET FORECAST DASHBOARD · WINDOWS",
    "download": "Descargar para Windows",
    "code": "Ver en GitHub ↗",
    "meta": "Windows 10/11 · Aplicación en inglés y chino · GPL-3.0",
    "startEyebrow": "INSTALACIÓN",
    "installTitle": "Descarga y abre el panel.",
    "step1": "Elige el instalador o la versión portátil en Releases.",
    "step2": "Abre el panel para ver los anuncios. Ajusta el idioma y el tamaño del texto en Configuración.",
    "step3": "Para ver tu cuota personal, instala el Codex CLI oficial e inicia sesión con codex login.",
    "installNote": "La guía explica cómo instalar el CLI, los avisos de Windows sobre el editor y dónde se guardan los ajustes.",
    "guide": "Guía de instalación ↗",
    "privacyLink": "Privacidad",
    "issues": "Informar de un problema",
    "features": [
      [
        "Un anuncio con hora cambia el panel a naranja.",
        "La vista habitual es verde oscuro. Un anuncio de reinicio automático con hora para tu plan activa el naranja, la cuenta atrás y la línea roja. Puedes ver cuánto tiempo queda y organizar tu cuota restante."
      ],
      [
        "Compara tu consumo con dos ritmos de referencia.",
        "Tres barras muestran el consumo real, un reinicio supuesto cada X días y el ritmo uniforme de tu ciclo personal. X empieza en 3 días y se puede cambiar. Arrastra las barras para ordenarlas."
      ],
      [
        "Sigue el ritmo de la línea roja.",
        "Avanza hacia la derecha y llega al 100 % a la hora anunciada. Compárala con el consumo real. Horas iguales usan una línea; horas distintas, dos líneas y una franja roja entre ellas."
      ],
      [
        "Consulta cinco fuentes en paralelo.",
        "Cada tarjeta muestra la próxima hora prevista, la publicación original y la última actualización. Abre los detalles para comparar los anuncios. Sin previsión activa, la tarjeta muestra «None»."
      ],
      [
        "Compara la hora registrada por cada fuente.",
        "El último reinicio y el tiempo transcurrido aparecen arriba. El historial empieza en septiembre de 2026, con lo más reciente primero. Abre una fila para ver horas, publicaciones y fuentes compartidas. Las horas usan la zona de Pekín."
      ],
      [
        "Ajusta el texto y deja el panel en la bandeja.",
        "Elige inglés o chino, cambia el tamaño del texto y activa el inicio con Windows. Los anuncios de reinicio automático con hora para tu plan generan una notificación que puedes confirmar. Los mensajes con horas similares se agrupan."
      ]
    ],
    "captions": [
      "Izquierda: modo habitual. Derecha: anuncio con hora.",
      "Consumo real, ciclo personalizado y ritmo del ciclo personal.",
      "Izquierda: una hora. Derecha: un intervalo de horas.",
      "Codex Reset · Did Codex Reset · NextReset · TIBO · Codex Reset Today",
      "Abre una fila para comparar horas y publicaciones.",
      "Idioma, texto, inicio y notificaciones."
    ]
  },
  "fr": {
    "hero": "Prévisions de reset et quota, au même endroit.",
    "intro": "Consultez les annonces de cinq sites et votre quota Codex restant. Dès qu’un horaire est publié, vous pouvez organiser votre consommation jusqu’au reset.",
    "eyebrow": "CODEX RESET FORECAST DASHBOARD · WINDOWS",
    "download": "Télécharger pour Windows",
    "code": "Voir sur GitHub ↗",
    "meta": "Windows 10/11 · Application en anglais et chinois · GPL-3.0",
    "startEyebrow": "INSTALLATION",
    "installTitle": "Téléchargez et ouvrez le tableau.",
    "step1": "Choisissez l’installateur ou la version portable dans Releases.",
    "step2": "Ouvrez le tableau pour consulter les annonces. Réglez la langue et la taille du texte dans les paramètres.",
    "step3": "Pour afficher votre quota personnel, installez le Codex CLI officiel et connectez-vous avec codex login.",
    "installNote": "Le guide explique l’installation du CLI, les messages Windows sur l’éditeur et l’emplacement des paramètres.",
    "guide": "Guide d’installation ↗",
    "privacyLink": "Confidentialité",
    "issues": "Signaler un problème",
    "features": [
      [
        "Un horaire annoncé fait passer le tableau à l’orange.",
        "La vue habituelle est vert foncé. Une annonce de reset automatique avec un horaire pour votre formule active l’orange, le compte à rebours et la ligne rouge. Vous voyez le temps restant pour utiliser votre quota."
      ],
      [
        "Comparez votre consommation à deux rythmes.",
        "Trois barres affichent la consommation réelle, un reset supposé tous les X jours et le rythme uniforme de votre cycle personnel. X vaut 3 jours au départ. Modifiez-le et réordonnez les barres par glisser-déposer."
      ],
      [
        "Suivez le rythme de la ligne rouge.",
        "Elle avance vers la droite et atteint 100 % à l’heure annoncée. Comparez-la à votre consommation réelle. Des horaires identiques donnent une ligne ; des horaires différents donnent deux lignes et une bande rouge."
      ],
      [
        "Consultez cinq sources côte à côte.",
        "Chaque carte affiche le prochain horaire prévu, la publication originale et la dernière mise à jour. Ouvrez les détails pour comparer les annonces. Sans prévision active, la carte affiche « None »."
      ],
      [
        "Comparez l’heure enregistrée par chaque site.",
        "Le dernier reset et le temps écoulé sont en haut. L’historique commence en septembre 2026, du plus récent au plus ancien. Dépliez une ligne pour voir les horaires, publications et sources communes. Les heures sont celles de Pékin."
      ],
      [
        "Réglez le texte, puis gardez le tableau dans la zone de notification.",
        "Choisissez l’anglais ou le chinois, ajustez le texte et activez le démarrage avec Windows. Les annonces de reset automatique avec horaire pour votre formule déclenchent une notification à confirmer. Les messages aux horaires proches sont regroupés."
      ]
    ],
    "captions": [
      "À gauche : vue habituelle. À droite : annonce avec horaire.",
      "Consommation réelle, cycle personnalisé et rythme personnel.",
      "À gauche : un horaire. À droite : une plage horaire.",
      "Codex Reset · Did Codex Reset · NextReset · TIBO · Codex Reset Today",
      "Dépliez une ligne pour comparer les horaires et publications.",
      "Langue, texte, démarrage et notifications."
    ]
  },
  "de": {
    "hero": "Reset-Prognosen und Kontingent zusammen.",
    "intro": "Sieh die Reset-Meldungen von fünf Websites neben deinem verbleibenden Codex-Kontingent. Sobald eine Uhrzeit angekündigt ist, kannst du deine Nutzung bis dahin planen.",
    "eyebrow": "CODEX RESET FORECAST DASHBOARD · WINDOWS",
    "download": "Für Windows herunterladen",
    "code": "Auf GitHub ansehen ↗",
    "meta": "Windows 10/11 · App auf Englisch und Chinesisch · GPL-3.0",
    "startEyebrow": "INSTALLATION",
    "installTitle": "Herunterladen und öffnen.",
    "step1": "Wähle den Installer oder die portable Version unter Releases.",
    "step2": "Öffne das Dashboard, um Reset-Meldungen zu sehen. Sprache und Schriftgröße findest du in den Einstellungen.",
    "step3": "Für dein persönliches Kontingent installiere die offizielle Codex CLI und melde dich mit codex login an.",
    "installNote": "Die Anleitung erklärt die CLI-Einrichtung, Windows-Herausgeberhinweise und den Speicherort der Einstellungen.",
    "guide": "Installationsanleitung ↗",
    "privacyLink": "Datenschutz",
    "issues": "Problem melden",
    "features": [
      [
        "Eine Meldung mit Uhrzeit färbt das Dashboard orange.",
        "Im Alltag ist die Ansicht dunkelgrün. Eine automatische Reset-Ankündigung mit Uhrzeit für deinen Tarif aktiviert Orange, Countdown und rote Ziellinie. So siehst du, wie viel Zeit für das verbleibende Kontingent bleibt."
      ],
      [
        "Vergleiche deinen Verbrauch mit zwei Richtwerten.",
        "Drei Balken zeigen den tatsächlichen Verbrauch, einen angenommenen Reset alle X Tage und die gleichmäßige Nutzung im persönlichen Zyklus. X ist anfangs 3 Tage. Ändere den Wert und sortiere die Balken per Ziehen."
      ],
      [
        "Halte mit der roten Linie Schritt.",
        "Die Linie bewegt sich nach rechts und erreicht zur angekündigten Uhrzeit 100 %. Vergleiche sie mit deinem Verbrauch. Gleiche Uhrzeiten ergeben eine Linie; verschiedene Uhrzeiten zwei Linien mit einem roten Band dazwischen."
      ],
      [
        "Lies fünf Quellen nebeneinander.",
        "Jede Karte zeigt die nächste erwartete Uhrzeit, die Originalmeldung und die letzte Aktualisierung. Öffne die Details zum Vergleichen. Ohne aktive Prognose steht auf der Karte „None“."
      ],
      [
        "Vergleiche die von jeder Quelle erfassten Zeiten.",
        "Der letzte Reset und die verstrichene Zeit stehen oben. Die Historie beginnt im September 2026, neueste Einträge zuerst. Klappe einen Eintrag auf, um Zeiten, Originalmeldungen und gemeinsame Feeds zu sehen. Alle Zeiten sind Pekinger Zeit."
      ],
      [
        "Stelle die Schrift ein und nutze das Tray.",
        "Wähle Englisch oder Chinesisch, passe die Schrift an und aktiviere den Start mit Windows. Automatische Reset-Ankündigungen mit Uhrzeit für deinen Tarif lösen eine bestätigbare Benachrichtigung aus. Ähnliche Reset-Zeiten werden zusammengefasst."
      ]
    ],
    "captions": [
      "Links: normale Ansicht. Rechts: Meldung mit Uhrzeit.",
      "Verbrauch, eigener Reset-Zyklus und persönlicher Rhythmus.",
      "Links: eine Uhrzeit. Rechts: ein Zeitbereich.",
      "Codex Reset · Did Codex Reset · NextReset · TIBO · Codex Reset Today",
      "Klappe einen Eintrag auf, um Zeiten und Meldungen zu vergleichen.",
      "Sprache, Schriftgröße, Autostart und Benachrichtigungen."
    ]
  },
  "ko": {
    "hero": "초기화 예고와 남은 사용량을 한곳에서.",
    "intro": "다섯 사이트의 초기화 소식과 Codex 잔여 사용량을 함께 확인하세요. 구체적인 시간이 발표되면 그때까지의 사용량을 계획할 수 있습니다.",
    "eyebrow": "CODEX RESET FORECAST DASHBOARD · WINDOWS",
    "download": "Windows용 다운로드",
    "code": "GitHub에서 보기 ↗",
    "meta": "Windows 10/11 · 앱 영어·중국어 지원 · GPL-3.0",
    "startEyebrow": "설치",
    "installTitle": "다운로드하고 실행하세요.",
    "step1": "Releases에서 설치 파일이나 포터블 버전을 선택하세요.",
    "step2": "실행하면 초기화 소식을 확인할 수 있습니다. 설정에서 언어와 글자 크기를 선택하세요.",
    "step3": "개인 잔여 사용량을 표시하려면 공식 Codex CLI를 설치하고 codex login으로 로그인하세요.",
    "installNote": "CLI 설치, Windows 게시자 알림, 설정 저장 위치는 설치 안내에서 확인할 수 있습니다.",
    "guide": "설치 안내 ↗",
    "privacyLink": "개인정보 처리",
    "issues": "문제 제보",
    "features": [
      [
        "시간이 발표되면 대시보드가 주황색으로 바뀝니다.",
        "평소에는 검은색과 초록색입니다. 이용 중인 요금제에 시간이 명시된 자동 초기화 예고가 나오면 주황색으로 바뀌고 카운트다운과 빨간 목표선이 나타납니다. 남은 시간과 사용량을 함께 확인할 수 있습니다."
      ],
      [
        "실제 소비를 두 가지 기준과 비교하세요.",
        "세 막대는 실제 소비, X일마다 초기화된다는 가정, 개인 주기의 균등 소비를 보여줍니다. X는 기본 3일이며 변경할 수 있습니다. 막대를 드래그해 순서도 바꿀 수 있습니다."
      ],
      [
        "빨간 선에 맞춰 사용하세요.",
        "선은 시간에 따라 오른쪽으로 이동해 예고 시각에 100%에 도달합니다. 실제 소비와 비교해 진행 정도를 확인하세요. 같은 시각은 한 선, 다른 시각은 두 선과 그 사이의 붉은 영역으로 표시합니다."
      ],
      [
        "다섯 출처의 글을 나란히 보세요.",
        "각 카드에 다음 예상 시각, 원문, 갱신 시각이 표시됩니다. 상세 내용을 열어 발표를 비교할 수 있습니다. 유효한 예고가 없으면 카드에 “None”이 표시됩니다."
      ],
      [
        "각 사이트가 기록한 시각을 비교하세요.",
        "위쪽에 최근 초기화와 경과 시간이 표시됩니다. 2026년 9월부터의 기록은 최신순으로 정렬됩니다. 기록을 펼쳐 각 시각, 원문, 공통 출처를 비교할 수 있습니다. 시간은 베이징 기준입니다."
      ],
      [
        "글자 크기를 정하고 트레이에서 계속 확인하세요.",
        "영어·중국어를 선택하고 글자 크기와 Windows 자동 시작을 설정하세요. 이용 중인 요금제의 시간이 있는 자동 초기화 예고는 확인할 때까지 남는 알림으로 표시됩니다. 비슷한 시각의 메시지는 하나로 합칩니다."
      ]
    ],
    "captions": [
      "왼쪽: 평상시. 오른쪽: 시간이 명시된 예고.",
      "실제 소비, 사용자 지정 주기, 개인 주기의 균등 소비.",
      "왼쪽: 하나의 시각. 오른쪽: 여러 시각의 범위.",
      "Codex Reset · Did Codex Reset · NextReset · TIBO · Codex Reset Today",
      "기록을 펼쳐 각 출처의 시각과 원문을 비교하세요.",
      "언어, 글자 크기, 자동 시작, 알림 설정."
    ]
  }
};
const images=['modes','pace','forecast','sources','history','settings'];
function renderSite(language){const t=translations[language]||translations.en;document.documentElement.lang=language;document.querySelector('#language').value=language;document.querySelectorAll('[data-text]').forEach(e=>{e.textContent=t[e.dataset.text];});const target=document.querySelector('#features');target.replaceChildren();t.features.forEach(([title,body],i)=>{const section=document.createElement('section');section.className='feature';const copy=document.createElement('div');copy.className='feature-copy';const number=document.createElement('span');number.className='number';number.textContent=`0${i+1}`;const words=document.createElement('div');const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=body;words.append(h,p);copy.append(number,words);const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=`assets/feature-${images[i]}.png?v=2.0.1`;img.alt=title;img.loading=i?'lazy':'eager';caption.textContent=t.captions[i];figure.append(img,caption);section.append(copy,figure);target.append(section);});document.title=language==='zh-CN'?'codex重置预测看板':'Codex Reset Forecast Dashboard';}
let saved;try{saved=localStorage.getItem('site-language');}catch{}
const browser=navigator.language.startsWith('zh')?'zh-CN':navigator.language.split('-')[0];renderSite(translations[saved]?saved:translations[browser]?browser:'en');
document.querySelector('#language').addEventListener('change',e=>{renderSite(e.target.value);try{localStorage.setItem('site-language',e.target.value);}catch{}});
