GitHub-база для генерации и адаптации сайта/приложения

Под “Контент-завод”: чистый HTML/CSS/JS, desktop + mobile, размещение на хостинге, дальнейшая генерация кода через AI.

Дата сборки: 29.05.2026. Формат: рабочий список репозиториев + правила применения + чеклист проверки.

Коротко: тебе нужен не один “супер-репозиторий”, а набор референсов под разные части приложения: dashboard shell, мобильная навигация, формы/модалки, состояние SPA, PWA, тесты и чеклисты качества. Основной принцип: смотреть паттерн, брать механику и переписывать под текущую архитектуру, а не тащить чужой шаблон целиком.

1. Что видно по текущему файлу

Текущий index.html — это уже SPA-кабинет на чистом HTML/CSS/JS, а не обычная посадочная. Поэтому подбор ниже заточен под интерфейс приложения: вход, верхнее меню, burger, генератор, медиатека, очередь/календарь, kanban, проекты, настройки, логи, модалки и overlay генерации.

Фронт: один HTML-файл, CSS-переменные, несколько style-слоёв, Vanilla JS, без внешних JS-фреймворков.

Адаптив: есть breakpoints примерно на 1280 / 1160 / 1020 / 900 / 860 / 760 px, мобильные scroll-snap ряды и отдельное поведение навигации.

Риск: файл уже большой; при дальнейшей генерации легко сломать каскад CSS, burger, модалки, ширину карточек и горизонтальный скролл.

Что нужно: единая app-shell система, нормальная мобильная проверка, доступные модалки/табы/меню, тесты на реальные размеры экранов и аккуратная сборка перед деплоем.

2. Как пользоваться этим списком

Не копировать репозиторий целиком. Сначала открыть demo/README, понять паттерн, потом переписать под свои классы и текущую структуру.

Для нового экрана брать 2–3 референса максимум: один по app-shell, один по компоненту, один по проверке/доступности.

Для каждого изменения проверять desktop, tablet и mobile. Главные ошибки: horizontal scroll, съехавший topbar, неподходящие min-width, длинные кнопки, переполненные карточки, модалки выше экрана.

Если код остаётся one-file, не подключать Bootstrap/Tailwind/React ради одного компонента. Если приложение разрастается, переносить проект на Vite и разбивать на modules.

3. Core-набор: держать под рукой всегда

Репозиторий

tabler/tabler  ·  core  github.com/tabler/tabler

Зачем

Главная база для dashboard/app UI: карточки, формы, таблицы, боковая навигация, состояния, пустые экраны, настройки.

Что брать

Компонентную сетку, плотность интерфейса, состояния кнопок/форм, аккуратные dashboard-паттерны под кабинет.

Не брать

Не тащить весь UI-kit в текущий one-file HTML. Использовать как референс и переписывать под свои классы.

Репозиторий

PlainAdmin/plain-free-bootstrap-admin-template  ·  core  github.com/PlainAdmin/plain-free-bootstrap-admin-template

Зачем

Хороший ориентир для админок с большим количеством страниц, форм, карточек и графиков.

Что брать

Логику dashboard-страниц, сетку карточек, мобильное поведение панелей, структуру настроек.

Не брать

Bootstrap можно не внедрять, если текущий проект остаётся на чистом CSS.

Репозиторий

puikinsh/adminator-admin-dashboard  ·  core  github.com/puikinsh/adminator-admin-dashboard

Зачем

Vanilla-JS админка без фреймворк-зоопарка. Полезна для структуры кабинета и поведения сайдбара/панелей.

Что брать

App-shell, topbar/sidebar, карточки статистики, таблицы, empty/loading/error states.

Не брать

Не копировать старую визуальную стилистику, брать только паттерны.

Репозиторий

themesberg/volt-bootstrap-5-dashboard  ·  core  github.com/themesberg/volt-bootstrap-5-dashboard

Зачем

Готовый dashboard на Bootstrap 5 и Vanilla JS. Хорош для понимания страниц приложения и состояний компонентов.

Что брать

Навигацию, формы, уведомления, карточки, layout-решения для кабинета.

Не брать

Не превращать текущий проект в Bootstrap-зависимость без причины.

Репозиторий

codedthemes/dashboard-kit-free-vanilla-js  ·  support  github.com/codedthemes/dashboard-kit-free-vanilla-js

Зачем

Дополнительный dashboard-референс: много типовых страниц, компонентов, графиков, таблиц.

Что брать

Структуру страниц и плотность UI, если нужно быстро собрать “админский” экран.

Не брать

Не использовать как дизайн-основу один-в-один: визуально может выглядеть шаблонно.

Репозиторий

w3c/wai-aria-practices  ·  core  github.com/w3c/aria-practices

Зачем

База по правильным интерактивным компонентам: tabs, menu button, dialog/modal, accordion, listbox, keyboard-навигация.

Что брать

ARIA-разметку и поведение клавиатуры для модалок, табов, меню, dropdown, burger, toast/alert.

Не брать

Не копировать без понимания: ARIA помогает только когда поведение реально соответствует паттерну.

Репозиторий

bejamas/data-slot  ·  core  github.com/bejamas/data-slot

Зачем

Headless UI primitives для Vanilla JS: доступные tabs/dialog/menu без тяжёлого фреймворка.

Что брать

Логику поведения компонентов, separation HTML/CSS/JS, клавиатурную доступность.

Не брать

Не ломать текущий HTML-стиль. Брать поведение, а не внешний вид.

Репозиторий

davidhund/awesome-vanilla-js  ·  core  github.com/davidhund/awesome-vanilla-js

Зачем

Каталог лёгких Vanilla JS компонентов: modals, tabs, dropdowns, carousels, drag/drop, file upload.

Что брать

Быстрый подбор маленьких библиотек вместо тяжёлых зависимостей.

Не брать

Проверять живость каждого найденного пакета отдельно.

Репозиторий

microsoft/playwright  ·  core  github.com/microsoft/playwright

Зачем

Нужен не для дизайна, а чтобы не гадать: desktop/mobile/tablet тесты, скриншоты, клики, формы, модалки.

Что брать

Автотесты на 1920/1440/1366/1024/768/430/390/360, проверку меню, модалок, форм, горизонтального скролла.

Не брать

Не заменяет ручной визуальный просмотр, но резко снижает количество случайных поломок.

Репозиторий

GoogleChrome/lighthouse-ci  ·  core  github.com/GoogleChrome/lighthouse-ci

Зачем

Контроль качества на хостинге: performance, accessibility, best practices, SEO, PWA/offline.

Что брать

Lighthouse-проверки при каждом деплое или хотя бы перед отправкой клиенту.

Не брать

Один высокий балл не значит, что UX хороший. Нужен вместе с визуальной проверкой.

Репозиторий

pwa-builder/pwa-starter-basic  ·  core  github.com/pwa-builder/pwa-starter-basic

Зачем

База для PWA-оболочки: manifest, service worker, installability, offline fallback.

Что брать

Минимальный service worker, manifest, app icons, offline fallback для hosted-приложения.

Не брать

Не кэшировать API-ответы и приватные данные без явной логики.

Репозиторий

vitejs/vite  ·  core  github.com/vitejs/vite

Зачем

Если приложение продолжит расти, один HTML на сотни килобайт лучше разделить на модули и собирать через Vite.

Что брать

Быструю разработку, сборку ассетов, разделение JS/CSS, env-переменные, preview перед деплоем.

Не брать

Не переводить проект на Vite ради моды. Делать, когда one-file уже мешает поддержке.

4. Дополнительные репозитории по задачам

Эти ссылки не обязательно использовать одновременно. Они нужны как библиотека решений: когда надо сделать конкретный компонент, берёшь 1–2 близких примера и переносишь паттерн в текущий код.

Мобильная навигация и меню

Репозиторий

Зачем

Ссылка

stevenhughes08/vanilla-js-navbar

простая responsive-навигация на чистом JS

открытьgithub.com/stevenhughes08/vanilla-js-navbar

HamzaJirah/responsive-navbar

side-menu/burger-подход для мобильного кабинета

открытьgithub.com/HamzaJirah/responsive-navbar

Ciscoo91/responsive-navbar-with-vanilla-javascript

mobile-first dropdown menu по клику на hamburger

открытьgithub.com/Ciscoo91/responsive-navbar-with-vanilla-javascript

Аккордеоны, табы, dropdown, carousel

Репозиторий

Зачем

Ссылка

zoltantothcom/vanilla-js-accordion

маленький accessible accordion

открытьgithub.com/zoltantothcom/vanilla-js-accordion

zoltantothcom/vanilla-js-tabs

лёгкие tabs без фреймворка

открытьgithub.com/zoltantothcom/vanilla-js-tabs

zoltantothcom/vanilla-js-dropdown

кастомный select/dropdown

открытьgithub.com/zoltantothcom/vanilla-js-dropdown

zoltantothcom/vanilla-js-carousel

маленькая carousel, если нужно не превращать мобильный экран в простыню

открытьgithub.com/zoltantothcom/vanilla-js-carousel

michu2k/Accordion

доступный accordion с API и обновлениями

открытьgithub.com/michu2k/Accordion

Формы, валидация, настройки

Репозиторий

Зачем

Ссылка

Andy-set-studio/boilerform

HTML/CSS база для нормальных форм

открытьgithub.com/Andy-set-studio/boilerform

joaopjt/vanillajs-validation

лёгкая JS-валидация без jQuery

открытьgithub.com/joaopjt/vanillajs-validation

ederssouza/vanillajs-form-validator

ещё один вариант pure JS validator

открытьgithub.com/ederssouza/vanillajs-form-validator

mbronstein1/simple-form

условный рендеринг, feedback, client-side validation

открытьgithub.com/mbronstein1/simple-form

SPA, состояние, localStorage

Репозиторий

Зачем

Ссылка

managervcf/vanilla-js-single-page-app

router, templates, structure для SPA без фреймворков

открытьgithub.com/managervcf/vanilla-js-single-page-app

mitchwadair/vanilla-spa-router

простой роутер для SPA

открытьgithub.com/mitchwadair/vanilla-spa-router

sassyelements/spa-router

path/hash router без фреймворка

открытьgithub.com/sassyelements/spa-router

ErickWendel/vanilla-js-web-app-example

localStorage + accessibility в Vanilla JS web app

открытьgithub.com/ErickWendel/vanilla-js-web-app-example

drodsou/context

state/actions/undo/localStorage pattern для Vanilla JS

открытьgithub.com/drodsou/context

Таблицы, календарь, очередь, kanban

Репозиторий

Зачем

Ссылка

jerrylow/basictable

responsive tables: desktop table -> mobile-friendly rows

открытьgithub.com/jerrylow/basictable

matejkadlec/vanilla-table

поиск, фильтры, сортировка, paging для таблиц

открытьgithub.com/matejkadlec/vanilla-table

ArtemSam23/Kanban

drag-and-drop kanban + touch support как идея

открытьgithub.com/ArtemSam23/Kanban

flowforfrank/drag-n-drop

простая drag/drop логика на Vanilla JS

открытьgithub.com/flowforfrank/drag-n-drop

MahmoudAlHaj4/Kanban-board

kanban с localStorage и drag/drop

открытьgithub.com/MahmoudAlHaj4/Kanban-board

CSS-система, адаптив, performance

Репозиторий

Зачем

Ссылка

Andy-set-studio/modern-css-reset

аккуратный CSS reset для предсказуемой базы

открытьgithub.com/Andy-set-studio/modern-css-reset

sturobson/Awesome-Container-Queries

подбор материалов по container queries

открытьgithub.com/sturobson/Awesome-Container-Queries

GoogleChromeLabs/container-query-polyfill

polyfill только если нужна поддержка старых браузеров

открытьgithub.com/GoogleChromeLabs/container-query-polyfill

thedaviddias/front-end-checklist

финальный чеклист перед публикацией

открытьgithub.com/thedaviddias/front-end-checklist

thedaviddias/Front-End-Performance-Checklist

performance чеклист

открытьgithub.com/thedaviddias/Front-End-Performance-Checklist

flowforfrank/performance-checklist

ещё один прикладной performance-чеклист

открытьgithub.com/flowforfrank/performance-checklist

Доступность и автопроверки

Репозиторий

Зачем

Ссылка

dequelabs/axe-core

движок accessibility-тестов

открытьgithub.com/dequelabs/axe-core

dequelabs/axe-core-npm

CLI/Playwright/Puppeteer-интеграции axe

открытьgithub.com/dequelabs/axe-core-npm

pa11y/pa11y

CLI-проверка доступности страницы

открытьgithub.com/pa11y/pa11y

pa11y/pa11y-ci

accessibility-тесты в CI

открытьgithub.com/pa11y/pa11y-ci

katekalcevich/Test-ARIA

простые ARIA-примеры: cards, nav, accordions, tabs, notifications, modals

открытьgithub.com/katekalcevich/Test-ARIA

PWA и installable web app

Репозиторий

Зачем

Ссылка

ibrahima92/pwa-with-vanilla-js

PWA с нуля на HTML/CSS/JS

открытьgithub.com/ibrahima92/pwa-with-vanilla-js

yostane/pwa_from_scratch

пошаговый PWA app shell, manifest, service worker

открытьgithub.com/yostane/pwa_from_scratch

Лендинги и промо-страницы рядом с приложением

Репозиторий

Зачем

Ссылка

GitHub topic: responsive-landing-page

искать свежие лендинги под промо-экран/публичную часть

открытьgithub.com/topics/responsive-landing-page?l=css

GitHub topic: landing-page

искать актуальные HTML/CSS landing examples

открытьgithub.com/topics/landing-page?l=css&o=desc&s=updated

5. Готовый рабочий набор под твоё приложение

Если нужно быстро дать AI контекст перед генерацией/рефакторингом, используй такие связки:

Задача

Какие репозитории открыть первыми

Новый экран кабинета

tabler/tabler + PlainAdmin + w3c/wai-aria-practices + Playwright

Мобильная навигация

stevenhughes08/vanilla-js-navbar + HamzaJirah/responsive-navbar + Ciscoo91/responsive-navbar-with-vanilla-javascript + WAI-ARIA

Модалка / настройки / dropdown

w3c/wai-aria-practices + bejamas/data-slot + zoltantothcom/vanilla-js-dropdown + axe-core

Форма входа / API-ключи / настройки

Andy-set-studio/boilerform + vanillajs-validation + WAI-ARIA + pa11y

Очередь / календарь / таблица

jerrylow/basictable + vanilla-table + Tabler + Playwright screenshots

Kanban / drag&drop

ArtemSam23/Kanban + flowforfrank/drag-n-drop + touch-тесты в Playwright

PWA/хостинг

pwa-builder/pwa-starter-basic + ibrahima92/pwa-with-vanilla-js + Lighthouse CI

Разделение большого index.html

Vite + vanilla SPA router + current CSS tokens + Lighthouse CI

6. Запросы для поиска новых референсов на GitHub

Когда текущего списка не хватает, ищи не “beautiful website”, а по конкретной проблеме. Вот нормальные запросы:

responsive dashboard html css javascript vanilla app UI github

vanilla js admin dashboard template responsive

mobile first dashboard css grid html javascript

responsive navbar vanilla js burger menu github

accessible modal vanilla js aria github

accessible tabs vanilla js aria github

multi step form vanilla js accessible github

vanilla js form validation lightweight github

responsive data table vanilla js github

kanban drag drop vanilla js touch localStorage github

PWA starter vanilla js service worker github

Lighthouse CI GitHub Actions static site

Playwright mobile emulation screenshot tests GitHub Actions

frontend performance checklist github

container queries responsive components github

7. Чеклист проверки mobile + desktop перед деплоем

Минимальные размеры, которые надо прогонять вручную или через Playwright:

Viewport

Зачем проверять

1920×1080

широкий desktop / iMac / 23"

1440×900

основной desktop

1366×768

ноутбук

1280×720

маленький ноутбук

1024×768

планшет landscape

820×1180

iPad portrait

768×1024

планшет portrait

430×932

крупный телефон

414×896

iPhone Plus/Pro Max типовой

390×844

частый мобильный размер

375×812

маленький iPhone

360×740

узкий Android

Проверять: нет горизонтального скролла; topbar не ломается; burger открывается/закрывается; меню не перекрывает контент; карточки не выдавливают сетку; модалка помещается в экран; формы доступны с клавиатуры; длинные тексты и URL не разрывают layout; loading/error/empty states выглядят нормально; на хостинге нет битых путей /uploads, favicon, manifest, service worker.

8. Мини-команды для качества

Задача

Команда

Playwright init

npm init playwright@latest

Playwright browsers

npx playwright install

Lighthouse CI

npm i -D @lhci/cli && npx lhci autorun

Pa11y one URL

npx pa11y https://your-domain.ru

Vite vanilla

npm create vite@latest my-app -- --template vanilla

9. Готовый промт для дальнейшей генерации кода

Ты работаешь с моим приложением “Контент-завод”: чистый HTML/CSS/JS, hosted web app, desktop + mobile. Перед генерацией кода используй GitHub-базу из этого файла как reference base, но не копируй чужой код целиком. Главные ориентиры: Tabler/PlainAdmin/Adminator для app-shell и dashboard UI; WAI-ARIA/data-slot для доступных модалок, меню, tabs/dropdown; vanilla navbar repos для burger/mobile; PWA Builder starter для manifest/service worker; Playwright/Lighthouse/axe/pa11y для проверки.Требования к результату: не использовать width:100vw; не ломать текущие классы без причины; держать min-width:0 у grid/flex детей; делать резиновую сетку через clamp/minmax/flex-wrap; проверять 1920, 1440, 1366, 1024, 768, 430, 390, 360; не допускать горизонтальный скролл; mobile не должен быть простынёй, где уместно использовать scroll-snap; модалки должны скроллиться внутри экрана; формы и кнопки должны работать с клавиатуры; код должен быть production-ready под хостинг.

10. Что точно не делать

Не тащить в текущий проект React/Next/Tailwind/Bootstrap только потому, что в референсе красиво. Это увеличит вес и усложнит поддержку.

Не лечить адаптив пачкой media queries без понимания причины. Часто проблема в min-width:auto, nowrap, фиксированной ширине, absolute-элементах или неправильном grid-template-columns.

Не хранить секретные ключи в localStorage и не кэшировать приватные API-ответы через service worker.

Не доверять только скриншоту desktop. Приложение должно проходить мобильные сценарии: вход, меню, генерация, просмотр результата, редактирование в модалке, очередь, настройки.

Не копировать чужой дизайн один-в-один. Использовать как инженерную базу паттернов.

11. Финальная логика работы

Для каждого нового изменения порядок такой: 1) выбрать задачу; 2) открыть 2–3 релевантных репозитория из списка; 3) взять паттерн, не дизайн целиком; 4) переписать под текущие классы и CSS-переменные; 5) проверить viewports; 6) прогнать Lighthouse/axe/pa11y; 7) проверить на хостинге реальные пути к ассетам и поведение после обновления страницы.

Примечание

Список составлен под текущий формат проекта: single-page приложение на чистом HTML/CSS/JS с dashboard-интерфейсом. Если позже проект уйдёт в React/Next/Vue, набор надо пересобрать: появятся другие UI kits, router/state patterns и build/deploy practices.