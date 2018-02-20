let isAllDay = function(event) {
  if (event['all_day']) return true;

  // legacy check for events pre-addition of 'all_day' attribute
  const start = moment(event['start']);
  const end = moment(event['end']);
  const startIsDayStart = start.hour() === 0 && start.minute() === 0;
  const endIsDayEnd = end.hour() === 23 && end.minute() === 59;
  return startIsDayStart && endIsDayEnd;
};

let setupEvent = function(event, args = {}) {
  let start;
  let end;
  let allDay;

  if (event) {
    start = moment(event['start']);

    if (event['end']) {
      end = moment(event['end']);
      allDay = isAllDay(event);
    }

    if (event['timezone'] && (allDay || !args.displayInUserTimezone)) {
      start = start.tz(event['timezone']);
      if (event['end']) {
        end = end.tz(event['timezone']);
      }
    }
  }

  return { start, end, allDay };
};

let timezoneLabel = function(timezone) {
  const offset = moment.tz(timezone).format('Z');
  let raw = timezone;
  let name = raw.replace('_', '');
  return`(${offset}) ${name}`;
};

let eventLabel = function(event, args = {}) {
  const icon = Discourse.SiteSettings.events_event_label_icon;
  const longFormat = Discourse.SiteSettings.events_event_label_format;
  const shortFormat = Discourse.SiteSettings.events_event_label_short_format;
  const shortOnlyStart = Discourse.SiteSettings.events_event_label_short_only_start;

  let label = `<i class='fa fa-${icon}'></i>`;

  if (!args.mobile) {
    const { start, end, allDay } = setupEvent(event, { displayInUserTimezone: args.displayInUserTimezone });

    let format = args.short ? shortFormat : longFormat;
    let formatArr = format.split(',');
    if (allDay) format = formatArr[0];
    let dateString = start.format(format);

    if (event['end'] && (!args.short || !shortOnlyStart)) {
      const diffDay = start.date() !== end.date();
      if (!allDay || diffDay) {
        const endFormat = (diffDay || allDay) ? format : formatArr[formatArr.length - 1];
        dateString += ` – ${end.format(endFormat)}`;
      }
    }

    let timezone = null;
    const forceTimezone = Discourse.SiteSettings.events_event_label_include_timezone;
    if (forceTimezone) {
      timezone = event['timezone'] || moment.tz.guess();
    }
    if (!allDay && args.showTimezoneIfDifferent && event['timezone'] && event['timezone'] !== moment.tz.guess()) {
      timezone = event['timezone'];
    }
    if (timezone) dateString += `, ${timezoneLabel(timezone)}`;

    label += `<span>${dateString}</span>`;
  }

  return label;
};

let utcDateTime = function(dateTime) {
  return moment.parseZone(dateTime).utc().format().replace(/-|:|\.\d\d\d/g,"");
};

let googleUri = function(params) {
  let href = "https://www.google.com/calendar/render?action=TEMPLATE";
  if (params.title) {
    href += `&text=${params.title.replace(/ /g,'+').replace(/[^\w+]+/g,'')}`;
  }
  href += `&dates=${utcDateTime(params.event.start)}/${utcDateTime(params.event.end)}`;
  href += `&details=${params.details || I18n.t('add_to_calendar.default_details', {url: params.url})}`;
  if (params.location) {
    href += `&location=${params.location}`;
  }
  href += "&sf=true&output=xml";
  return href;
};

let icsUri = function(params) {
  return encodeURI(
    'data:text/calendar;charset=utf8,' + [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'URL:' + document.URL,
      'DTSTART:' + (utcDateTime(params.event.start) || ''),
      'DTEND:' + (utcDateTime(params.event.end) || ''),
      'SUMMARY:' + (params.title || ''),
      'DESCRIPTION:' + (params.details || ''),
      'LOCATION:' + (params.location || ''),
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\n'));
};

let allDayAttrs = function(attrs, topic, startIsSame, endIsSame, isBetween) {
  attrs['classes'] += ' all-day';
  attrs['allDay'] = true;

  if (startIsSame) {
    attrs['classes'] += ' start';
  }

  if (endIsSame) {
    attrs['classes'] += ' end';
  }

  if (isBetween) {
    attrs['classes'] += ' is-between';
  }

  if (!endIsSame || isBetween) {
    attrs['classes'] += ' multi';
  }

  if (topic.category) {
    attrs['listStyle'] += `background-color: #${topic.category.color};`;
  }

  return attrs;
};

let eventCalculations = function(day, start, end) {
  // equivalent momentjs comparisons dont work well with all-day timezone handling
  const date = day.date();
  const month = day.month();
  const startDate = start.date();
  const startMonth = start.month();
  const startIsSame = date === startDate && month === startMonth;
  const endIsSame = end && (date === end.date()) && (month === end.month());
  const isBetween = end && (month === startMonth || month === end.month()) && (date > startDate) && (date < end.date());
  const daysLeft = end ? (end.date() - day.date()) + 1 : 1;

  return { startIsSame, endIsSame, isBetween, daysLeft };
};

let eventsForDay = function(day, topics, args = {}) {
  const events = topics.filter((t) => t.event);
  const fullWidth = args.dateEvents || args.expanded;
  let allDayPosition = 0;

  return events.reduce((dayEvents, topic) => {
    const { start, end, allDay } = setupEvent(topic.event);
    const { startIsSame, endIsSame, isBetween, daysLeft } = eventCalculations(day, start, end);
    const onThisDay = startIsSame || endIsSame || isBetween;

    if (onThisDay) {
      let attrs = {
        topicId: topic.id,
        classes: '',
        listStyle: ''
      };

      if (fullWidth) {
        attrs['classes'] += 'full-width';
      }

      if (allDay) {
        attrs = allDayAttrs(attrs, topic, startIsSame, endIsSame, isBetween);

        if (topic.event.allDayPosition === undefined) {
          topic.event.allDayPosition = allDayPosition;
        }
        allDayPosition ++;
      } else {
        attrs['time'] = moment(topic.event.start).format('h:mm a');

        if (topic.category) {
          attrs['dotStyle'] = Ember.String.htmlSafe(`color: #${topic.category.color}`);
        }
      }

      if (startIsSame || fullWidth || args.rowIndex === 0) {
        attrs['title'] = topic.title;

        if (allDay && !fullWidth) {
          let daysInRow = daysLeft > 7 ? 7 - args.rowIndex : daysLeft;
          attrs['titleStyle'] = Ember.String.htmlSafe(`width: calc((100%*${daysInRow}) - 12px);`);
        }
      }

      attrs['listStyle'] = Ember.String.htmlSafe(attrs['listStyle']);

      if (allDay) {
        if (dayEvents.length < topic.event.allDayPosition && !fullWidth) {
          dayEvents.push({ allDay: true, empty: true });
          allDayPosition ++;
        }

        let replace = 0;
        const emptyIndex = dayEvents.findIndex((e) => e.empty);
        if ((startIsSame && emptyIndex > -1) || topic.event.replaceEmpty)  {
          topic.event.allDayPosition = emptyIndex;
          topic.event.replaceEmpty = true;
          replace = 1;
        }

        dayEvents.splice(topic.event.allDayPosition, replace, attrs);
      } else {
        dayEvents.push(attrs);
      }
    }

    return dayEvents;
  }, []).sort((a, b) => Boolean(b.allDay) - Boolean(a.allDay));
};

export { eventLabel, googleUri, icsUri, eventsForDay, isAllDay, setupEvent, timezoneLabel };
