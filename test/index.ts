import logger, {
  createStreamParser,
} from '@pnpm/logger'
import test = require('tape')
import normalizeNewline = require('normalize-newline')
import {toOutput$} from 'pnpm-default-reporter'
import {stripIndents} from 'common-tags'
import chalk from 'chalk'
import xs, {Stream} from 'xstream'
import StackTracey = require('stacktracey')

const WARN = chalk.bgYellow.black('\u2009WARN\u2009')
const ERROR = chalk.bgRed.black('\u2009ERROR\u2009')
const DEPRECATED = chalk.red('deprecated')
const versionColor = chalk.grey
const ADD = chalk.green('+')
const SUB = chalk.red('-')
const LINKED = chalk.magentaBright('#')
const h1 = chalk.blue
const hlValue = chalk.blue
const hlPkgId = chalk['whiteBright']
const POSTINSTALL = hlValue('postinstall')
const PREINSTALL = hlValue('preinstall')
const INSTALL = hlValue('install')

const progressLogger = logger<object>('progress')
const stageLogger = logger<string>('stage')
const rootLogger = logger<object>('root')
const deprecationLogger = logger<object>('deprecation')
const summaryLogger = logger<object>('summary')
const lifecycleLogger = logger<object>('lifecycle')
const packageJsonLogger = logger<object>('package-json')

test('prints progress beginning', t => {
  const output$ = toOutput$(createStreamParser())

  const pkgId = 'registry.npmjs.org/foo/1.0.0'

  progressLogger.debug({
    status: 'resolving_content',
    pkgId,
  })

  t.plan(1)

  output$.take(1).subscribe({
    next: output => {
      t.equal(output, `Resolving: total ${hlValue('1')}, reused ${hlValue('0')}, downloaded ${hlValue('0')}`)
    },
    error: t.end,
    complete: t.end,
  })
})

test('prints progress on first download', t => {
  const output$ = toOutput$(createStreamParser())

  const pkgId = 'registry.npmjs.org/foo/1.0.0'

  progressLogger.debug({
    status: 'resolving_content',
    pkgId,
  })
  progressLogger.debug({
    status: 'fetched',
    pkgId,
  })

  t.plan(1)

  output$.drop(1).take(1).subscribe({
    next: output => {
      t.equal(output, `Resolving: total ${hlValue('1')}, reused ${hlValue('0')}, downloaded ${hlValue('1')}`)
    },
    complete: t.end,
    error: t.end,
  })
})

test('moves fixed line to the end', t => {
  const output$ = toOutput$(createStreamParser())

  const pkgId = 'registry.npmjs.org/foo/1.0.0'

  progressLogger.debug({
    status: 'resolving_content',
    pkgId,
  })
  progressLogger.debug({
    status: 'fetched',
    pkgId,
  })
  logger.warn('foo')
  stageLogger.debug('resolution_done')

  t.plan(1)

  output$.drop(3).take(1).map(normalizeNewline).subscribe({
    next: output => {
      t.equal(output, stripIndents`
        ${WARN} foo
        Resolving: total ${hlValue('1')}, reused ${hlValue('0')}, downloaded ${hlValue('1')}, done
      `)
    },
    complete: t.end,
    error: t.end,
  })
})

test('prints "Already up-to-date"', t => {
  const output$ = toOutput$(createStreamParser())

  stageLogger.debug('resolution_done')

  t.plan(1)

  output$.take(1).map(normalizeNewline).subscribe({
    next: output => {
      t.equal(output, stripIndents`
        Already up-to-date
      `)
    },
    complete: t.end,
    error: t.end,
  })
})

test('prints summary', t => {
  const output$ = toOutput$(createStreamParser())

  packageJsonLogger.debug({
    initial: {
      dependencies: {
        'is-13': '^1.0.0',
      },
      devDependencies: {
        'is-negative': '^1.0.0',
      },
    },
  })
  deprecationLogger.warn({
    pkgName: 'bar',
    pkgVersion: '2.0.0',
    pkgId: 'registry.npmjs.org/bar/2.0.0',
    deprecated: 'This package was deprecated because bla bla bla',
    depth: 0,
  })
  rootLogger.info({
    added: {
      dependencyType: 'prod',
      name: 'foo',
      version: '1.0.0',
      latest: '2.0.0',
      id: 'registry.npmjs.org/foo/1.0.0',
    },
  })
  rootLogger.info({
    added: {
      dependencyType: 'prod',
      name: 'bar',
      version: '2.0.0',
      latest: '1.0.0', // this won't be printed in summary because latest is less than current version
      id: 'registry.npmjs.org/bar/2.0.0',
    },
  })
  rootLogger.info({
    removed: {
      dependencyType: 'prod',
      name: 'foo',
      version: '0.1.0',
    },
  })
  rootLogger.info({
    added: {
      dependencyType: 'dev',
      name: 'qar',
      version: '2.0.0',
      id: 'registry.npmjs.org/qar/2.0.0',
    },
  })
  rootLogger.info({
    added: {
      dependencyType: 'optional',
      name: 'lala',
      version: '1.1.0',
      id: 'registry.npmjs.org/lala/1.1.0',
    },
  })
  rootLogger.info({
    removed: {
      dependencyType: 'optional',
      name: 'is-positive',
    },
  })
  rootLogger.debug({
    linked: {
      dependencyType: 'optional',
      from: '/src/is-linked',
      name: 'is-linked',
      to: '/src/project/node_modules'
    },
  })
  packageJsonLogger.debug({
    updated: {
      dependencies: {
        'is-negative': '^1.0.0',
      },
      devDependencies: {
        'is-13': '^1.0.0',
      },
    }
  })
  summaryLogger.info()

  t.plan(1)

  output$.drop(1).take(1).map(normalizeNewline).subscribe({
    next: output => {
      t.equal(output, stripIndents`
        ${WARN} ${DEPRECATED} bar@2.0.0: This package was deprecated because bla bla bla

        ${h1('dependencies:')}
        ${ADD} bar ${versionColor('2.0.0')} ${DEPRECATED}
        ${SUB} foo ${versionColor('0.1.0')}
        ${ADD} foo ${versionColor('1.0.0')} ${versionColor('(2.0.0 is available)')}
        ${SUB} is-13 ${versionColor('^1.0.0')}
        ${ADD} is-negative ${versionColor('^1.0.0')}

        ${h1('optionalDependencies:')}
        ${LINKED} is-linked ${chalk.magentaBright('linked from')} ${chalk.grey('/src/is-linked')}
        ${SUB} is-positive
        ${ADD} lala ${versionColor('1.1.0')}

        ${h1('devDependencies:')}
        ${ADD} is-13 ${versionColor('^1.0.0')}
        ${SUB} is-negative ${versionColor('^1.0.0')}
        ${ADD} qar ${versionColor('2.0.0')}
        ` + '\n')
    },
    complete: t.end,
    error: t.end,
  })
})

test('groups lifecycle output', t => {
  const output$ = toOutput$(createStreamParser())

  const pkgId = 'registry.npmjs.org/foo/1.0.0'

  lifecycleLogger.debug({
    pkgId: 'registry.npmjs.org/foo/1.0.0',
    line: 'foo',
    script: 'preinstall',
  })
  lifecycleLogger.debug({
    pkgId: 'registry.npmjs.org/foo/1.0.0',
    line: 'foo I',
    script: 'postinstall',
  })
  lifecycleLogger.debug({
    pkgId: 'registry.npmjs.org/bar/1.0.0',
    line: 'bar I',
    script: 'postinstall',
  })
  lifecycleLogger.debug({
    pkgId: 'registry.npmjs.org/foo/1.0.0',
    line: 'foo II',
    script: 'postinstall',
  })
  lifecycleLogger.debug({
    pkgId: 'registry.npmjs.org/foo/1.0.0',
    line: 'foo III',
    script: 'postinstall',
  })
  lifecycleLogger.debug({
    pkgId: 'registry.npmjs.org/qar/1.0.0',
    line: '...',
    script: 'install',
  })
  lifecycleLogger.debug({
    pkgId: 'registry.npmjs.org/qar/1.0.0',
    exitCode: 0,
    script: 'install',
  })

  t.plan(1)

  const childOutputColor = chalk.grey

  output$.drop(6).take(1).map(normalizeNewline).subscribe({
    next: output => {
      t.equal(output, stripIndents`
        Running ${PREINSTALL} for ${hlPkgId('registry.npmjs.org/foo/1.0.0')}: ${childOutputColor('foo')}
        Running ${POSTINSTALL} for ${hlPkgId('registry.npmjs.org/foo/1.0.0')}: ${childOutputColor('foo III')}
        Running ${POSTINSTALL} for ${hlPkgId('registry.npmjs.org/bar/1.0.0')}: ${childOutputColor('bar I')}
        Running ${INSTALL} for ${hlPkgId('registry.npmjs.org/qar/1.0.0')}, done
      `)
    },
    complete: t.end,
    error: t.end,
  })
})

// Many libs use stderr for logging, so showing all stderr adds not much value
test['skip']('prints lifecycle progress', t => {
  const output$ = toOutput$(createStreamParser())

  const pkgId = 'registry.npmjs.org/foo/1.0.0'

  lifecycleLogger.debug({
    pkgId: 'registry.npmjs.org/foo/1.0.0',
    line: 'foo I',
    script: 'postinstall',
  })
  lifecycleLogger.debug({
    pkgId: 'registry.npmjs.org/bar/1.0.0',
    line: 'bar I',
    script: 'postinstall',
  })
  lifecycleLogger.error({
    pkgId: 'registry.npmjs.org/foo/1.0.0',
    line: 'foo II',
    script: 'postinstall',
  })
  lifecycleLogger.debug({
    pkgId: 'registry.npmjs.org/foo/1.0.0',
    line: 'foo III',
    script: 'postinstall',
  })

  t.plan(1)

  const childOutputColor = chalk.grey
  const childOutputError = chalk.red

  output$.drop(3).take(1).map(normalizeNewline).subscribe({
    next: output => {
      t.equal(output, stripIndents`
        Running ${POSTINSTALL} for ${hlPkgId('registry.npmjs.org/foo/1.0.0')}: ${childOutputColor('foo I')}
        Running ${POSTINSTALL} for ${hlPkgId('registry.npmjs.org/foo/1.0.0')}! ${childOutputError('foo II')}
        Running ${POSTINSTALL} for ${hlPkgId('registry.npmjs.org/foo/1.0.0')}: ${childOutputColor('foo III')}
        Running ${POSTINSTALL} for ${hlPkgId('registry.npmjs.org/bar/1.0.0')}: ${childOutputColor('bar I')}
      `)
    },
    complete: t.end,
    error: t.end,
  })
})

test('prints generic error', t => {
  const output$ = toOutput$(createStreamParser())

  const err = new Error('some error')
  logger.error(err)

  t.plan(1)

  output$.take(1).subscribe({
    next: output => {
      t.equal(output, stripIndents`
        ${ERROR} ${chalk.red('some error')}
        ${new StackTracey(err.stack).pretty}
      `)
    },
    complete: t.end,
    error: t.end,
  })
})

test('prints info', t => {
  const output$ = toOutput$(createStreamParser())

  logger.info('info message')

  t.plan(1)

  output$.take(1).subscribe({
    next: output => {
      t.equal(output, 'info message')
    },
    complete: t.end,
    error: t.end,
  })
})

test('prints progress of big files download', t => {
  let output$ = toOutput$(createStreamParser()).map(normalizeNewline) as Stream<string>
  const stream$: Stream<string>[] = []

  const pkgId1 = 'registry.npmjs.org/foo/1.0.0'
  const pkgId2 = 'registry.npmjs.org/bar/2.0.0'
  const pkgId3 = 'registry.npmjs.org/qar/3.0.0'

  progressLogger.debug({
    status: 'resolving_content',
    pkgId: pkgId1,
  })

  stream$.push(
    output$.take(1)
      .debug(output => t.equal(output, `Resolving: total ${hlValue('1')}, reused ${hlValue('0')}, downloaded ${hlValue('0')}`))
  )

  output$ = output$.drop(1)

  progressLogger.debug({
    status: 'fetching_started',
    pkgId: pkgId1,
    size: 1024 * 1024 * 10, // 10 MB
    attempt: 1,
  })

  stream$.push(
    output$.take(1)
      .debug(output => t.equal(output, stripIndents`
        Resolving: total ${hlValue('1')}, reused ${hlValue('0')}, downloaded ${hlValue('0')}
        Downloading ${hlPkgId(pkgId1)}: ${hlValue('0 B')}/${hlValue('10.5 MB')}
      `))
  )

  output$ = output$.drop(1)

  progressLogger.debug({
    status: 'fetching_progress',
    pkgId: pkgId1,
    downloaded: 1024 * 1024 * 5.5, // 5.5 MB
  })

  stream$.push(
    output$.take(1)
      .debug(output => t.equal(output, stripIndents`
        Resolving: total ${hlValue('1')}, reused ${hlValue('0')}, downloaded ${hlValue('0')}
        Downloading ${hlPkgId(pkgId1)}: ${hlValue('5.77 MB')}/${hlValue('10.5 MB')}
      `))
  )

  output$ = output$.drop(1)

  progressLogger.debug({
    status: 'resolving_content',
    pkgId: pkgId2,
  })

  progressLogger.debug({
    status: 'fetching_started',
    pkgId: pkgId1,
    size: 10, // 10 B
    attempt: 1,
  })

  progressLogger.debug({
    status: 'fetching_progress',
    pkgId: pkgId1,
    downloaded: 1024 * 1024 * 7,
  })

  stream$.push(
    output$.drop(1).take(1)
      .debug(output => t.equal(output, stripIndents`
        Resolving: total ${hlValue('2')}, reused ${hlValue('0')}, downloaded ${hlValue('0')}
        Downloading ${hlPkgId(pkgId1)}: ${hlValue('7.34 MB')}/${hlValue('10.5 MB')}
      `, 'downloading of small package not reported'))
  )

  output$ = output$.drop(2)

  progressLogger.debug({
    status: 'resolving_content',
    pkgId: pkgId3,
  })

  progressLogger.debug({
    status: 'fetching_started',
    pkgId: pkgId3,
    size: 1024 * 1024 * 20, // 20 MB
    attempt: 1,
  })

  progressLogger.debug({
    status: 'fetching_progress',
    pkgId: pkgId3,
    downloaded: 1024 * 1024 * 19, // 19 MB
  })

  stream$.push(
    output$.drop(2).take(1)
      .debug(output => t.equal(output, stripIndents`
        Resolving: total ${hlValue('3')}, reused ${hlValue('0')}, downloaded ${hlValue('0')}
        Downloading ${hlPkgId(pkgId1)}: ${hlValue('7.34 MB')}/${hlValue('10.5 MB')}
        Downloading ${hlPkgId(pkgId3)}: ${hlValue('19.9 MB')}/${hlValue('21 MB')}
      `))
  )

  output$ = output$.drop(3)

  progressLogger.debug({
    status: 'fetching_progress',
    pkgId: pkgId1,
    downloaded: 1024 * 1024 * 10, // 10 MB
  })

  stream$.push(
    output$.take(1)
      .debug(output => t.equal(output, stripIndents`
        ${chalk.dim(`Downloading ${hlPkgId(pkgId1)}: ${hlValue('10.5 MB')}/${hlValue('10.5 MB')}, done`)}
        Resolving: total ${hlValue('3')}, reused ${hlValue('0')}, downloaded ${hlValue('0')}
        Downloading ${hlPkgId(pkgId3)}: ${hlValue('19.9 MB')}/${hlValue('21 MB')}
      `))
  )

  xs.combine
    .apply(xs, stream$)
    .subscribe({
      complete: t.end,
      error: t.end,
    })
})
