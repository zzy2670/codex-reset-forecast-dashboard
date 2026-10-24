'use strict';
const translations={
  "en": {
    "hero": "Codex quota and reset forecasts",
    "intro": "A Windows dashboard for your remaining Codex quota and reset announcements from five websites. Check upcoming reset times, compare your usage and browse past resets. Timed reset messages trigger Windows notifications.",
    "eyebrow": "CODEX RESET FORECAST DASHBOARD · WINDOWS",
    "download": "Download for Windows",
    "code": "View on GitHub ↗",
    "meta": "Windows 10/11 · English and Chinese · GPL-3.0",
    "startEyebrow": "INSTALLATION",
    "installTitle": "Install on Windows",
    "step1": "Download the installer or portable version from Releases.",
    "step2": "Open the dashboard to see reset announcements. Choose your language and text size in Settings.",
    "step3": "Codex is included. Your local Codex sign-in with ChatGPT connects your quota; if you are signed out, follow the sign-in prompt.",
    "guide": "Installation guide ↗",
    "privacyLink": "Privacy",
    "issues": "Report an issue",
    "features": [
      [
        "The dashboard",
        "Remaining quota and the latest verified reset at the top, five source cards below, then reset history. Dates and times default to Beijing time (UTC+8). Choose another time zone in Settings."
      ],
      [
        "Routine and accelerated modes",
        "Routine mode shows your quota in green. A timed automatic-reset announcement for your plan switches the dashboard to coral orange and adds a countdown."
      ],
      [
        "Quota usage",
        "Four bars show actual usage, pacing for an assumed X-day reset cycle, pacing toward a calendar-selected time, and even usage across your personal cycle. The default is 3 days; click the label to change it. Set the calendar target separately, clear either assumption, and drag a handle to reorder the bars."
      ],
      [
        "The red reset pacing line",
        "The line moves right and reaches 100% at the announced reset time. Compare it with your usage bar. Matching times share a line; different times create two lines and a red band."
      ],
      [
        "Five reset sources",
        "Each card shows the site’s next reset time, announcement and update time. Expand the details to read the post and open its link. NextReset and TIBO share a feed."
      ],
      [
        "Reset history",
        "Browse resets from September 2026, newest first. Expand a record to compare each site’s timestamp and original post. The latest cross-checked reset and elapsed time appear at the top of the dashboard."
      ],
      [
        "Automatic Windows notifications",
        "When a source reports an automatic-reset announcement or confirmation for your plan with a specific time, Windows shows a notification. It stays until you click Acknowledge. Similar reset times are grouped."
      ],
      [
        "Display and background settings",
        "Choose English or Chinese, adjust text size, and enable notifications, tray monitoring or startup with Windows."
      ]
    ],
    "captions": [
      "The full dashboard, with an active reset announcement.",
      "Routine mode on the left; accelerated mode on the right.",
      "Usage bars, drag handle and assumed reset interval.",
      "One reset time on the left; a time range on the right.",
      "Forecasts and expanded source details.",
      "Latest reset and an expanded history record.",
      "Windows notification illustration: reset time, plan and Acknowledge button.",
      "Language, tray, startup, text size and notifications."
    ]
  },
  "zh-CN": {
    "hero": "Codex 额度与重置预告",
    "intro": "一款 Windows 桌面看板，用来查看 Codex 剩余额度、跟踪五个网站的重置预告，并比较历史重置时间。 有具体时间的重置消息，会自动弹出 Windows 通知。",
    "eyebrow": "CODEX 重置预测看板 · WINDOWS",
    "download": "下载 Windows 版",
    "code": "在 GitHub 查看 ↗",
    "meta": "Windows 10/11 · 软件中英双语 · GPL-3.0",
    "startEyebrow": "安装",
    "installTitle": "安装 Windows 版",
    "step1": "在 Releases 选择安装版或便携版。",
    "step2": "打开即可查看重置消息，在设置中选择语言和字号。",
    "step3": "看板已内置官方 Codex，已有本机 Codex 的 ChatGPT 登录会自动接入额度；未登录时按提示授权。",
    "guide": "安装说明 ↗",
    "privacyLink": "隐私说明",
    "issues": "反馈问题",
    "features": [
      [
        "看板全貌",
        "顶部是剩余额度和最近一次已核对的重置，中间是五个信源，底部是历史记录。日期和时间默认显示为北京时间，可在设置中切换时区。"
      ],
      [
        "常规模式与加速模式",
        "平时用绿色显示额度。当信源给出适用当前套餐的定时自动重置预告时，看板切换成珊瑚橙，并显示距离重置还有多久。"
      ],
      [
        "额度消耗进度",
        "四条横条分别显示实际消耗、假设每 X 天重置的节奏、日历指定时间的节奏，以及个人周期的均匀节奏。X 默认 3 天，点击标签修改；日历预测独立设置，两个假设可分别清除。拖动左侧把手可以调整顺序。"
      ],
      [
        "红色重置节奏线",
        "红线随时间向右推进，在预告重置时刻到达 100%。拿它和实际消耗对照，可以安排重置前的使用。各站时间相同就合成一条线，时间不同则显示两条线和中间的红色范围。"
      ],
      [
        "五个重置信源",
        "每列显示该网站的下次重置时间、公告和更新时间。展开详情可以阅读原文、打开原帖。NextReset 和 TIBO 共用一个上游，核对时归为同一组。"
      ],
      [
        "历史重置记录",
        "从 2026 年 9 月开始收录，最新记录排在最上面。展开一条记录，可以逐站比较时间并查看原帖。最近一次已核对的重置时间和距今时长，也会显示在看板顶部。"
      ],
      [
        "Windows 自动弹窗",
        "检测到适用当前套餐、带具体时间的自动重置预告或完成消息时，Windows 自动弹窗。点“确认收到”关闭；相近时间的消息合并提醒。"
      ],
      [
        "显示与后台设置",
        "可切换中英文、调节字号、开关通知、开机启动或关闭至托盘。"
      ]
    ],
    "captions": [
      "完整看板，图中已出现重置预告。",
      "左侧为常规模式，右侧为加速模式。",
      "消耗横条、拖动把手与假设重置周期。",
      "左侧一个预告时间，右侧多个时间形成的范围。",
      "五个信源的预计时间和展开详情。",
      "最近一次重置，以及展开的历史记录。",
      "Windows 通知示意：重置时间、适用套餐与“确认收到”按钮。",
      "语言、托盘、开机启动、字号与通知。"
    ]
  },
  "ja": {
    "hero": "Codex の利用枠とリセット予告",
    "intro": "Codex の残り利用枠と5つのサイトのリセット予告を確認する Windows 用ダッシュボード。使用ペースや過去のリセット時刻も表示します。",
    "eyebrow": "CODEX RESET FORECAST DASHBOARD · WINDOWS",
    "download": "Windows 版をダウンロード",
    "code": "GitHub で見る ↗",
    "meta": "Windows 10/11 · アプリは英語・中国語 · GPL-3.0",
    "startEyebrow": "インストール",
    "installTitle": "Windows にインストール",
    "step1": "Releases でインストーラーかポータブル版を選びます。",
    "step2": "起動するとリセット情報を確認できます。設定で言語と文字サイズを選べます。",
    "step3": "公式 Codex を同梱しています。ローカルの Codex で ChatGPT にログイン済みなら利用枠を自動表示し、未ログインなら画面の案内に従って認証します。",
    "guide": "インストールガイド ↗",
    "privacyLink": "プライバシー",
    "issues": "問題を報告",
    "features": [
      [
        "ダッシュボード全体",
        "上部に残り利用枠と照合済みの直近リセット、その下に5つの情報源と履歴を表示します。日時の初期設定は北京時間（UTC+8）です。設定からタイムゾーンを変更できます。"
      ],
      [
        "通常モードと加速モード",
        "通常は利用枠を緑で表示します。利用プランに適用される自動リセットの時刻が予告されると、コーラルオレンジに変わり、残り時間を表示します。"
      ],
      [
        "利用枠の消費ペース",
        "4本のバーで実際の使用量、X日ごとのリセットを仮定したペース、カレンダーで指定した時刻までのペース、個人サイクルの均等ペースを比較できます。Xは初期値3日。日数とカレンダーの仮定は個別に設定・解除でき、ハンドルで並べ替えられます。"
      ],
      [
        "赤いリセットペースライン",
        "予告時刻に100%に達するよう、線が時間とともに右へ進みます。実際の使用量と比べて消費ペースを調整できます。同じ時刻は1本、異なる時刻は2本の線と赤い帯で表示します。"
      ],
      [
        "5つのリセット情報源",
        "各列に次回時刻、投稿、更新時刻を表示します。詳細を開いて原文とリンクを確認できます。NextResetとTIBOは同じ上流ソースに属します。"
      ],
      [
        "リセット履歴",
        "2026年9月以降の記録を新しい順に表示します。記録を開くと各サイトの時刻と原文を比較できます。直近の照合済みリセットと経過時間は上部にも表示します。"
      ],
      [
        "Windows の自動通知",
        "現在のプランに適用される、具体的な時刻付きの自動リセット予告や完了情報を検出すると、Windows に通知を表示します。確認ボタンを押すまで表示され、近い時刻の情報はまとめて通知します。"
      ],
      [
        "表示とバックグラウンド設定",
        "英語・中国語、文字サイズ、通知のオン・オフ、トレイ常駐、Windows起動時の自動起動を設定できます。"
      ]
    ],
    "captions": [
      "リセット予告がある状態の全画面。",
      "左は通常モード、右は加速モード。",
      "使用量バー、並べ替えハンドル、仮定サイクル。",
      "左は1つの時刻、右は時刻の範囲。",
      "5つの情報源と展開した詳細。",
      "直近のリセットと展開した履歴。",
      "Windows 通知のイメージ：リセット時刻、対象プラン、確認ボタン。",
      "言語、トレイ、自動起動、文字サイズ、通知。"
    ]
  },
  "es": {
    "hero": "Cuota de Codex y próximos reinicios",
    "intro": "Un panel para Windows con tu cuota restante de Codex y los anuncios de reinicio de cinco sitios. Consulta las próximas fechas, compara tu consumo y revisa el historial.",
    "eyebrow": "CODEX RESET FORECAST DASHBOARD · WINDOWS",
    "download": "Descargar para Windows",
    "code": "Ver en GitHub ↗",
    "meta": "Windows 10/11 · Aplicación en inglés y chino · GPL-3.0",
    "startEyebrow": "INSTALACIÓN",
    "installTitle": "Instalar en Windows",
    "step1": "Elige el instalador o la versión portátil en Releases.",
    "step2": "Abre el panel para ver los anuncios. Ajusta el idioma y el tamaño del texto en Configuración.",
    "step3": "Codex viene incluido. Tu sesión local de Codex con ChatGPT conecta la cuota; si no has iniciado sesión, sigue las indicaciones.",
    "guide": "Guía de instalación ↗",
    "privacyLink": "Privacidad",
    "issues": "Informar de un problema",
    "features": [
      [
        "El panel completo",
        "Arriba aparecen la cuota restante y el último reinicio contrastado; debajo, las cinco fuentes y el historial. Las fechas y horas usan por defecto la hora de Pekín (UTC+8). Puedes cambiar la zona horaria en Ajustes."
      ],
      [
        "Modo habitual y modo acelerado",
        "La cuota se muestra en verde. Un anuncio de reinicio automático con hora concreta para tu plan cambia el panel a naranja coral y añade una cuenta atrás."
      ],
      [
        "Consumo de cuota",
        "Cuatro barras muestran el consumo real, el ritmo de un reinicio supuesto cada X días, el ritmo hasta la fecha elegida en el calendario y el uso uniforme durante tu ciclo personal. X empieza en 3 días. Configura y borra cada supuesto por separado; arrastra los controles para ordenar las barras."
      ],
      [
        "La línea roja de ritmo hasta el reinicio",
        "La línea avanza hasta llegar al 100 % a la hora anunciada. Compárala con tu consumo. Las horas coincidentes comparten una línea; las distintas forman dos líneas y una franja roja."
      ],
      [
        "Cinco fuentes de reinicios",
        "Cada tarjeta muestra la próxima hora, el anuncio y la actualización de ese sitio. Despliega los detalles para leer el texto y abrir el enlace. NextReset y TIBO comparten una fuente."
      ],
      [
        "Historial de reinicios",
        "Consulta los registros desde septiembre de 2026, del más reciente al más antiguo. Despliega uno para comparar las horas y publicaciones de cada sitio. El último reinicio contrastado y el tiempo transcurrido también aparecen arriba."
      ],
      [
        "Notificaciones automáticas de Windows",
        "Al detectar un anuncio o una confirmación de reinicio automático para tu plan con una hora concreta, Windows muestra una notificación. Permanece hasta que pulsas Confirmar recepción. Los horarios cercanos se agrupan."
      ],
      [
        "Ajustes de pantalla y segundo plano",
        "Elige inglés o chino, ajusta el tamaño del texto y configura las notificaciones, la bandeja del sistema y el inicio con Windows."
      ]
    ],
    "captions": [
      "El panel completo con un anuncio de reinicio activo.",
      "Modo habitual a la izquierda y acelerado a la derecha.",
      "Barras, control de orden y ciclo supuesto.",
      "Una hora a la izquierda; un intervalo a la derecha.",
      "Cinco fuentes con los detalles desplegados.",
      "Último reinicio y registro histórico desplegado.",
      "Ejemplo de notificación de Windows: hora, plan y botón de confirmación.",
      "Idioma, bandeja, inicio, texto y notificaciones."
    ]
  },
  "fr": {
    "hero": "Quota Codex et prévisions de réinitialisation",
    "intro": "Un tableau de bord Windows pour votre quota Codex restant et les annonces de cinq sites. Consultez les prochains horaires, comparez votre consommation et parcourez l’historique.",
    "eyebrow": "CODEX RESET FORECAST DASHBOARD · WINDOWS",
    "download": "Télécharger pour Windows",
    "code": "Voir sur GitHub ↗",
    "meta": "Windows 10/11 · Application en anglais et chinois · GPL-3.0",
    "startEyebrow": "INSTALLATION",
    "installTitle": "Installer sur Windows",
    "step1": "Choisissez l’installateur ou la version portable dans Releases.",
    "step2": "Ouvrez le tableau pour consulter les annonces. Réglez la langue et la taille du texte dans les paramètres.",
    "step3": "Codex est inclus. Votre connexion locale de Codex avec ChatGPT permet de lire votre quota ; si vous êtes déconnecté, suivez les indications.",
    "guide": "Guide d’installation ↗",
    "privacyLink": "Confidentialité",
    "issues": "Signaler un problème",
    "features": [
      [
        "Le tableau de bord",
        "Le quota restant et la dernière réinitialisation recoupée sont en haut, suivis des cinq sources et de l’historique. Les dates et heures utilisent par défaut l’heure de Pékin (UTC+8). Le fuseau horaire peut être changé dans les paramètres."
      ],
      [
        "Mode normal et mode accéléré",
        "Le quota s’affiche en vert. Une annonce de réinitialisation automatique à heure précise pour votre forfait fait passer le tableau au corail et ajoute un compte à rebours."
      ],
      [
        "Consommation du quota",
        "Quatre barres affichent la consommation réelle, le rythme d’un cycle supposé de X jours, le rythme jusqu’à la date choisie dans le calendrier et le rythme régulier du cycle personnel. X vaut 3 jours par défaut. Réglez et effacez chaque hypothèse séparément ; faites glisser les poignées pour réordonner les barres."
      ],
      [
        "La ligne rouge de rythme jusqu’à la réinitialisation",
        "La ligne progresse vers la droite et atteint 100 % à l’heure annoncée. Comparez-la à votre consommation. Une heure commune donne une seule ligne ; plusieurs horaires donnent deux lignes avec une zone rouge entre elles."
      ],
      [
        "Cinq sources de réinitialisation",
        "Chaque carte affiche le prochain horaire, l’annonce et la mise à jour du site. Ouvrez les détails pour lire le texte et suivre son lien. NextReset et TIBO partagent la même source."
      ],
      [
        "Historique des réinitialisations",
        "Les événements depuis septembre 2026 sont classés du plus récent au plus ancien. Dépliez une entrée pour comparer les horaires et publications de chaque site. La dernière réinitialisation recoupée et le temps écoulé figurent aussi en haut."
      ],
      [
        "Notifications automatiques de Windows",
        "Quand une source annonce ou confirme une réinitialisation automatique pour votre forfait à une heure précise, Windows affiche une notification. Elle reste jusqu’à confirmation. Les horaires proches sont regroupés."
      ],
      [
        "Affichage et fonctionnement en arrière-plan",
        "Choisissez l’anglais ou le chinois, la taille du texte, les notifications, la zone de notification et le démarrage avec Windows."
      ]
    ],
    "captions": [
      "Vue complète avec une annonce de réinitialisation active.",
      "Mode normal à gauche, mode accéléré à droite.",
      "Barres, poignée de tri et cycle supposé.",
      "Un horaire à gauche, une plage à droite.",
      "Cinq sources et leurs détails ouverts.",
      "Dernière réinitialisation et entrée d’historique ouverte.",
      "Illustration de notification Windows : heure, forfait et bouton de confirmation.",
      "Langue, zone de notification, démarrage, texte et alertes."
    ]
  },
  "de": {
    "hero": "Codex-Kontingent und Reset-Prognosen",
    "intro": "Ein Windows-Dashboard für dein verbleibendes Codex-Kontingent und Reset-Meldungen von fünf Websites. Sieh dir kommende Zeiten an, vergleiche deinen Verbrauch und blättere durch frühere Resets.",
    "eyebrow": "CODEX RESET FORECAST DASHBOARD · WINDOWS",
    "download": "Für Windows herunterladen",
    "code": "Auf GitHub ansehen ↗",
    "meta": "Windows 10/11 · App auf Englisch und Chinesisch · GPL-3.0",
    "startEyebrow": "INSTALLATION",
    "installTitle": "Unter Windows installieren",
    "step1": "Wähle den Installer oder die portable Version unter Releases.",
    "step2": "Öffne das Dashboard, um Reset-Meldungen zu sehen. Sprache und Schriftgröße findest du in den Einstellungen.",
    "step3": "Codex ist enthalten. Mit deiner lokalen Codex-Anmeldung über ChatGPT wird dein Kontingent verbunden; andernfalls folge der Anmeldung.",
    "guide": "Installationsanleitung ↗",
    "privacyLink": "Datenschutz",
    "issues": "Problem melden",
    "features": [
      [
        "Das Dashboard",
        "Oben stehen das Restkontingent und der letzte abgeglichene Reset. Darunter folgen fünf Quellen und der Verlauf. Standardmäßig werden Datum und Uhrzeit in Pekinger Zeit (UTC+8) angezeigt. Die Zeitzone lässt sich in den Einstellungen ändern."
      ],
      [
        "Normaler und beschleunigter Modus",
        "Normalerweise ist das Kontingent grün. Ein automatischer Reset mit konkreter Uhrzeit für deinen Tarif färbt das Dashboard korallorange und ergänzt einen Countdown."
      ],
      [
        "Kontingentverbrauch",
        "Vier Balken zeigen den tatsächlichen Verbrauch, das Tempo bei einem angenommenen Reset alle X Tage, das Tempo bis zum gewählten Kalendertermin und die gleichmäßige Nutzung im persönlichen Zyklus. X startet bei 3 Tagen. Beide Annahmen lassen sich getrennt einstellen und löschen; mit den Griffen sortierst du die Balken."
      ],
      [
        "Die rote Tempolinie bis zum Reset",
        "Die Linie wandert nach rechts und erreicht zur angekündigten Zeit 100 %. Vergleiche sie mit deinem Verbrauch. Gleiche Zeiten teilen sich eine Linie; verschiedene Zeiten ergeben zwei Linien mit einem roten Bereich dazwischen."
      ],
      [
        "Fünf Reset-Quellen",
        "Jede Karte zeigt die nächste Zeit, die Meldung und die Aktualisierung der Website. Öffne die Details für den Text und seinen Link. NextReset und TIBO teilen sich eine gemeinsame Quelle."
      ],
      [
        "Reset-Verlauf",
        "Die Einträge ab September 2026 erscheinen mit dem neuesten zuerst. Klappe einen Eintrag auf, um Zeiten und Beiträge der einzelnen Websites zu vergleichen. Der letzte abgeglichene Reset und die vergangene Zeit stehen auch oben."
      ],
      [
        "Automatische Windows-Benachrichtigungen",
        "Meldet eine Quelle eine automatische Rücksetzung für deinen Tarif mit konkreter Uhrzeit oder bestätigt sie diese, zeigt Windows eine Benachrichtigung. Sie bleibt bis zur Bestätigung sichtbar. Nahe beieinanderliegende Zeiten werden zusammengefasst."
      ],
      [
        "Anzeige und Hintergrundbetrieb",
        "Wähle Englisch oder Chinesisch, passe die Textgröße an und konfiguriere Benachrichtigungen, Infobereich und Windows-Autostart."
      ]
    ],
    "captions": [
      "Das vollständige Dashboard mit einer aktiven Reset-Meldung.",
      "Links der normale, rechts der beschleunigte Modus.",
      "Verbrauchsbalken, Sortiergriff und angenommener Zyklus.",
      "Links eine Zeit, rechts ein Zeitbereich.",
      "Fünf Quellen mit geöffneten Details.",
      "Letzter Reset und aufgeklappter Verlaufseintrag.",
      "Beispiel einer Windows-Benachrichtigung: Uhrzeit, Tarif und Bestätigung.",
      "Sprache, Infobereich, Autostart, Schriftgröße und Hinweise."
    ]
  },
  "ko": {
    "hero": "Codex 잔여 사용량과 초기화 예고",
    "intro": "Codex 잔여 사용량과 다섯 사이트의 초기화 예고를 확인하는 Windows 대시보드입니다. 다음 초기화 시간, 사용 속도, 지난 초기화 기록을 보여 줍니다.",
    "eyebrow": "CODEX RESET FORECAST DASHBOARD · WINDOWS",
    "download": "Windows용 다운로드",
    "code": "GitHub에서 보기 ↗",
    "meta": "Windows 10/11 · 앱 영어·중국어 지원 · GPL-3.0",
    "startEyebrow": "설치",
    "installTitle": "Windows에 설치",
    "step1": "Releases에서 설치 파일이나 포터블 버전을 선택하세요.",
    "step2": "실행하면 초기화 소식을 확인할 수 있습니다. 설정에서 언어와 글자 크기를 선택하세요.",
    "step3": "공식 Codex가 포함되어 있습니다. 로컬 Codex에서 ChatGPT에 로그인한 상태면 사용량을 자동으로 연결하며, 로그인하지 않았다면 안내에 따라 인증하세요.",
    "guide": "설치 안내 ↗",
    "privacyLink": "개인정보 처리",
    "issues": "문제 제보",
    "features": [
      [
        "전체 대시보드",
        "위에는 잔여 사용량과 대조한 최근 초기화가, 아래에는 다섯 정보 출처와 기록이 표시됩니다. 날짜와 시간은 기본적으로 베이징 시간(UTC+8)으로 표시하며, 설정에서 시간대를 바꿀 수 있습니다."
      ],
      [
        "일반 모드와 가속 모드",
        "평소에는 사용량을 녹색으로 표시합니다. 현재 요금제에 해당하는 자동 초기화 시간이 예고되면 코럴 오렌지로 바뀌고 카운트다운이 나타납니다."
      ],
      [
        "사용량 비교",
        "네 막대로 실제 사용량, X일마다 초기화한다고 가정한 속도, 달력에서 지정한 시각까지의 속도, 개인 주기의 균등 사용 속도를 비교합니다. X는 기본 3일입니다. 두 가정은 각각 설정하거나 지울 수 있고, 핸들을 끌어 막대 순서를 바꿀 수 있습니다."
      ],
      [
        "빨간 초기화 페이스라인",
        "선은 시간에 따라 오른쪽으로 이동해 예고 시각에 100%에 도달합니다. 실제 사용량과 비교하며 속도를 조절할 수 있습니다. 같은 시각은 한 줄로, 다른 시각은 두 줄과 그 사이의 빨간 영역으로 표시합니다."
      ],
      [
        "다섯 초기화 출처",
        "각 카드에 다음 초기화 시간, 공지, 갱신 시각을 표시합니다. 상세 정보를 펼쳐 원문과 링크를 확인할 수 있습니다. NextReset과 TIBO는 같은 원천을 공유합니다."
      ],
      [
        "초기화 기록",
        "2026년 9월부터의 기록을 최신순으로 표시합니다. 기록을 펼치면 사이트별 시각과 원문을 비교할 수 있습니다. 대조한 최근 초기화와 경과 시간은 화면 위에도 표시합니다."
      ],
      [
        "Windows 자동 알림",
        "현재 요금제에 해당하는 자동 초기화 예고나 완료 소식에 구체적인 시각이 있으면 Windows 알림을 표시합니다. 확인 버튼을 누를 때까지 표시되며, 비슷한 시각의 소식은 묶어서 알립니다."
      ],
      [
        "표시 및 백그라운드 설정",
        "영어·중국어, 글자 크기, 알림 켜기·끄기, 트레이 실행, Windows 시작 시 실행을 설정합니다."
      ]
    ],
    "captions": [
      "초기화 예고가 표시된 전체 대시보드.",
      "왼쪽은 일반 모드, 오른쪽은 가속 모드.",
      "사용량 막대, 순서 핸들, 가정 주기.",
      "왼쪽은 한 시각, 오른쪽은 시간 범위.",
      "다섯 출처와 펼친 상세 정보.",
      "최근 초기화와 펼친 기록.",
      "Windows 알림 예시: 초기화 시각, 대상 요금제, 확인 버튼.",
      "언어, 트레이, 자동 실행, 글자 크기, 알림."
    ]
  }
};
const images=['overview','modes','pace','forecast','sources','history','notifications','settings'];
function renderSite(language){const t=translations[language]||translations.en;document.documentElement.lang=language;document.querySelector('#language').value=language;document.querySelectorAll('[data-text]').forEach(e=>{e.textContent=t[e.dataset.text];});const target=document.querySelector('#features');target.replaceChildren();t.features.forEach(([title,body],i)=>{const section=document.createElement('section');section.className='feature';const copy=document.createElement('div');copy.className='feature-copy';const number=document.createElement('span');number.className='number';number.textContent=`0${i+1}`;const words=document.createElement('div');const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=body;words.append(h,p);copy.append(number,words);const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=`assets/${language==='zh-CN'?'zh-CN/':''}feature-${images[i]}.png?v=bilingual-images-20261011`;img.alt=title;img.loading=i?'lazy':'eager';caption.textContent=t.captions[i];figure.append(img,caption);section.append(copy,figure);target.append(section);});document.title=language==='zh-CN'?'codex重置预测看板':'Codex Reset Forecast Dashboard';document.querySelector('.brand span').textContent=document.title;document.querySelector('#language').setAttribute('aria-label',language==='zh-CN'?'语言':'Language');document.querySelector('.language .sr-only').textContent=language==='zh-CN'?'语言':'Language';}
let saved;try{saved=localStorage.getItem('site-language');}catch{}
renderSite(translations[saved]?saved:'zh-CN');
document.querySelector('#language').addEventListener('change',e=>{renderSite(e.target.value);try{localStorage.setItem('site-language',e.target.value);}catch{}});
