import { vol } from 'memfs';
import { extname } from 'path';
import { RuleFailure } from 'tslint';
import * as ts from 'typescript';
import {
  DependencyType,
  ProjectGraph,
  ProjectType
} from '../core/project-graph';
import { Rule } from './nxEnforceModuleBoundariesRule';
import { TargetProjectLocator } from '../core/target-project-locator';

jest.mock('fs', () => require('memfs').fs);
jest.mock('../utils/app-root', () => ({ appRootPath: '/root' }));

const tsconfig = {
  compilerOptions: {
    baseUrl: '.',
    paths: {
      '@mycompany/impl': ['libs/impl/src/index.ts'],
      '@mycompany/untagged': ['libs/untagged/src/index.ts'],
      '@mycompany/api': ['libs/api/src/index.ts'],
      '@mycompany/impl-domain2': ['libs/impl-domain2/src/index.ts'],
      '@mycompany/impl-both-domains': ['libs/impl-both-domains/src/index.ts'],
      '@mycompany/impl2': ['libs/impl2/src/index.ts'],
      '@mycompany/other': ['libs/other/src/index.ts'],
      '@mycompany/other/a/b': ['libs/other/src/a/b.ts'],
      '@mycompany/other/a': ['libs/other/src/a/index.ts'],
      '@mycompany/another/a/b': ['libs/another/a/b.ts'],
      '@mycompany/myapp': ['apps/myapp/src/index.ts'],
      '@mycompany/mylib': ['libs/mylib/src/index.ts'],
      '@mycompany/mylibName': ['libs/mylibName/src/index.ts'],
      '@mycompany/anotherlibName': ['libs/anotherlibName/src/index.ts'],
      '@mycompany/badcirclelib': ['libs/badcirclelib/src/index.ts'],
      '@mycompany/domain1': ['libs/domain1/src/index.ts'],
      '@mycompany/domain2': ['libs/domain2/src/index.ts']
    },
    types: ['node']
  },
  exclude: ['**/*.spec.ts'],
  include: ['**/*.ts']
};

const fileSys = {
  './libs/impl/src/index.ts': '',
  './libs/untagged/src/index.ts': '',
  './libs/api/src/index.ts': '',
  './libs/impl-domain2/src/index.ts': '',
  './libs/impl-both-domains/src/index.ts': '',
  './libs/impl2/src/index.ts': '',
  './libs/other/src/index.ts': '',
  './libs/other/src/a/b.ts': '',
  './libs/other/src/a/index.ts': '',
  './libs/another/a/b.ts': '',
  './apps/myapp/src/index.ts': '',
  './libs/mylib/src/index.ts': '',
  './libs/mylibName/src/index.ts': '',
  './libs/anotherlibName/src/index.ts': '',
  './libs/badcirclelib/src/index.ts': '',
  './libs/domain1/src/index.ts': '',
  './libs/domain2/src/index.ts': '',
  './tsconfig.json': JSON.stringify(tsconfig)
};

describe('Enforce Module Boundaries', () => {
  beforeEach(() => {
    vol.fromJSON(fileSys, '/root');
  });

  it('should not error when everything is in order', () => {
    const failures = runRule(
      { allow: ['@mycompany/mylib/deep'] },
      `${process.cwd()}/proj/apps/myapp/src/main.ts`,
      `
        import '@mycompany/mylib';
        import '@mycompany/mylib/deep';
        import '../blah';
      `,
      {
        nodes: {
          myappName: {
            name: 'myappName',
            type: ProjectType.app,
            data: {
              root: 'libs/myapp',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [
                createFile(`apps/myapp/src/main.ts`),
                createFile(`apps/myapp/blah.ts`)
              ]
            }
          },
          mylibName: {
            name: 'mylibName',
            type: ProjectType.lib,
            data: {
              root: 'libs/mylib',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [
                createFile(`libs/mylib/src/index.ts`),
                createFile(`libs/mylib/src/deep.ts`)
              ]
            }
          }
        },
        dependencies: {}
      }
    );

    expect(failures.length).toEqual(0);
  });

  it('should handle multiple projects starting with the same prefix properly', () => {
    const failures = runRule(
      {},
      `${process.cwd()}/proj/apps/myapp/src/main.ts`,
      `
        import '@mycompany/myapp2/mylib';
      `,
      {
        nodes: {
          myappName: {
            name: 'myappName',
            type: ProjectType.app,
            data: {
              root: 'libs/myapp',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [
                createFile(`apps/myapp/src/main.ts`),
                createFile(`apps/myapp/src/blah.ts`)
              ]
            }
          },
          myapp2Name: {
            name: 'myapp2Name',
            type: ProjectType.app,
            data: {
              root: 'libs/myapp2',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: []
            }
          },
          'myapp2-mylib': {
            name: 'myapp2-mylib',
            type: ProjectType.lib,
            data: {
              root: 'libs/myapp2/mylib',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile('libs/myapp2/mylib/src/index.ts')]
            }
          }
        },
        dependencies: {}
      }
    );

    expect(failures.length).toEqual(0);
  });

  describe('depConstraints', () => {
    const graph = {
      nodes: {
        apiName: {
          name: 'apiName',
          type: ProjectType.lib,
          data: {
            root: 'libs/api',
            tags: ['api', 'domain1'],
            implicitDependencies: [],
            architect: {},
            files: [createFile(`libs/api/src/index.ts`)]
          }
        },
        'impl-both-domainsName': {
          name: 'impl-both-domainsName',
          type: ProjectType.lib,
          data: {
            root: 'libs/impl-both-domains',
            tags: ['impl', 'domain1', 'domain2'],
            implicitDependencies: [],
            architect: {},
            files: [createFile(`libs/impl-both-domains/src/index.ts`)]
          }
        },
        'impl-domain2Name': {
          name: 'impl-domain2Name',
          type: ProjectType.lib,
          data: {
            root: 'libs/impl-domain2',
            tags: ['impl', 'domain2'],
            implicitDependencies: [],
            architect: {},
            files: [createFile(`libs/impl-domain2/src/index.ts`)]
          }
        },
        impl2Name: {
          name: 'impl2Name',
          type: ProjectType.lib,
          data: {
            root: 'libs/impl2',
            tags: ['impl', 'domain1'],
            implicitDependencies: [],
            architect: {},
            files: [createFile(`libs/impl2/src/index.ts`)]
          }
        },
        implName: {
          name: 'implName',
          type: ProjectType.lib,
          data: {
            root: 'libs/impl',
            tags: ['impl', 'domain1'],
            implicitDependencies: [],
            architect: {},
            files: [createFile(`libs/impl/src/index.ts`)]
          }
        },
        untaggedName: {
          name: 'untaggedName',
          type: ProjectType.lib,
          data: {
            root: 'libs/untagged',
            tags: [],
            implicitDependencies: [],
            architect: {},
            files: [createFile(`libs/untagged/src/index.ts`)]
          }
        }
      },
      dependencies: {}
    };

    const depConstraints = {
      depConstraints: [
        { sourceTag: 'api', onlyDependOnLibsWithTags: ['api'] },
        { sourceTag: 'impl', onlyDependOnLibsWithTags: ['api', 'impl'] },
        { sourceTag: 'domain1', onlyDependOnLibsWithTags: ['domain1'] },
        { sourceTag: 'domain2', onlyDependOnLibsWithTags: ['domain2'] }
      ]
    };

    beforeEach(() => {
      vol.fromJSON(fileSys, '/root');
    });

    it('should error when the target library does not have the right tag', () => {
      const failures = runRule(
        depConstraints,
        `${process.cwd()}/proj/libs/api/src/index.ts`,
        `
        import '@mycompany/impl';
      `,
        graph
      );

      expect(failures[0].getFailure()).toEqual(
        'A project tagged with "api" can only depend on libs tagged with "api"'
      );
    });

    it('should error when the target library is untagged', () => {
      const failures = runRule(
        depConstraints,
        `${process.cwd()}/proj/libs/api/src/index.ts`,
        `
        import '@mycompany/untagged';
      `,
        graph
      );

      expect(failures[0].getFailure()).toEqual(
        'A project tagged with "api" can only depend on libs tagged with "api"'
      );
    });

    it('should error when the source library is untagged', () => {
      const failures = runRule(
        depConstraints,
        `${process.cwd()}/proj/libs/untagged/src/index.ts`,
        `
        import '@mycompany/api';
      `,
        graph
      );

      expect(failures[0].getFailure()).toEqual(
        'A project without tags cannot depend on any libraries'
      );
    });

    it('should check all tags', () => {
      const failures = runRule(
        depConstraints,
        `${process.cwd()}/proj/libs/impl/src/index.ts`,
        `
        import '@mycompany/impl-domain2';
      `,
        graph
      );

      expect(failures[0].getFailure()).toEqual(
        'A project tagged with "domain1" can only depend on libs tagged with "domain1"'
      );
    });

    it('should allow a domain1 project to depend on a project that is tagged with domain1 and domain2', () => {
      const failures = runRule(
        depConstraints,
        `${process.cwd()}/proj/libs/impl/src/index.ts`,
        `
        import '@mycompany/impl-both-domains';
      `,
        graph
      );

      expect(failures.length).toEqual(0);
    });

    it('should allow a domain1/domain2 project depend on domain1', () => {
      const failures = runRule(
        depConstraints,
        `${process.cwd()}/proj/libs/impl-both-domain/src/index.ts`,
        `
        import '@mycompany/impl';
      `,
        graph
      );

      expect(failures.length).toEqual(0);
    });

    it('should not error when the constraints are satisfied', () => {
      const failures = runRule(
        depConstraints,
        `${process.cwd()}/proj/libs/impl/src/index.ts`,
        `
        import '@mycompany/impl2';
      `,
        graph
      );

      expect(failures.length).toEqual(0);
    });

    it('should support wild cards', () => {
      const failures = runRule(
        {
          depConstraints: [{ sourceTag: '*', onlyDependOnLibsWithTags: ['*'] }]
        },
        `${process.cwd()}/proj/libs/api/src/index.ts`,
        `
        import '@mycompany/impl';
      `,
        graph
      );

      expect(failures.length).toEqual(0);
    });
  });

  describe('relative imports', () => {
    it('should not error when relatively importing the same library', () => {
      const failures = runRule(
        {},
        `${process.cwd()}/proj/libs/mylib/src/main.ts`,
        'import "../other"',
        {
          nodes: {
            mylibName: {
              name: 'mylibName',
              type: ProjectType.lib,
              data: {
                root: 'libs/mylib',
                tags: [],
                implicitDependencies: [],
                architect: {},
                files: [
                  createFile(`libs/mylib/src/main.ts`),
                  createFile(`libs/mylib/other.ts`)
                ]
              }
            }
          },
          dependencies: {}
        }
      );
      expect(failures.length).toEqual(0);
    });

    it('should not error when relatively importing the same library (index file)', () => {
      const failures = runRule(
        {},
        `${process.cwd()}/proj/libs/mylib/src/main.ts`,
        'import "../other"',
        {
          nodes: {
            mylibName: {
              name: 'mylibName',
              type: ProjectType.lib,
              data: {
                root: 'libs/mylib',
                tags: [],
                implicitDependencies: [],
                architect: {},
                files: [
                  createFile(`libs/mylib/src/main.ts`),
                  createFile(`libs/mylib/other/index.ts`)
                ]
              }
            }
          },
          dependencies: {}
        }
      );
      expect(failures.length).toEqual(0);
    });

    it('should error when relatively importing another library', () => {
      const failures = runRule(
        {},
        `${process.cwd()}/proj/libs/mylib/src/main.ts`,
        'import "../../other"',
        {
          nodes: {
            mylibName: {
              name: 'mylibName',
              type: ProjectType.lib,
              data: {
                root: 'libs/mylib',
                tags: [],
                implicitDependencies: [],
                architect: {},
                files: [createFile(`libs/mylib/src/main.ts`)]
              }
            },
            otherName: {
              name: 'otherName',
              type: ProjectType.lib,
              data: {
                root: 'libs/other',
                tags: [],
                implicitDependencies: [],
                architect: {},
                files: [createFile('libs/other/src/index.ts')]
              }
            }
          },
          dependencies: {}
        }
      );
      expect(failures[0].getFailure()).toEqual(
        'library imports must start with @mycompany/'
      );
    });

    it('should error when relatively importing the src directory of another library', () => {
      const failures = runRule(
        {},
        `${process.cwd()}/proj/libs/mylib/src/main.ts`,
        'import "../../other/src"',

        {
          nodes: {
            mylibName: {
              name: 'mylibName',
              type: ProjectType.lib,
              data: {
                root: 'libs/mylib',
                tags: [],
                implicitDependencies: [],
                architect: {},
                files: [createFile(`libs/mylib/src/main.ts`)]
              }
            },
            otherName: {
              name: 'otherName',
              type: ProjectType.lib,
              data: {
                root: 'libs/other',
                tags: [],
                implicitDependencies: [],
                architect: {},
                files: [createFile('libs/other/src/index.ts')]
              }
            }
          },
          dependencies: {}
        }
      );
      expect(failures[0].getFailure()).toEqual(
        'library imports must start with @mycompany/'
      );
    });
  });

  it('should error on absolute imports into libraries without using the npm scope', () => {
    const failures = runRule(
      {},
      `${process.cwd()}/proj/libs/mylib/src/main.ts`,
      'import "libs/src/other.ts"',
      {
        nodes: {
          mylibName: {
            name: 'mylibName',
            type: ProjectType.lib,
            data: {
              root: 'libs/mylib',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [
                createFile(`libs/mylib/src/main.ts`),
                createFile(`libs/mylib/src/other.ts`)
              ]
            }
          }
        },
        dependencies: {}
      }
    );

    expect(failures.length).toEqual(1);
    expect(failures[0].getFailure()).toEqual(
      'library imports must start with @mycompany/'
    );
  });

  it('should respect regexp in allow option', () => {
    const failures = runRule(
      { allow: ['^.*/utils/.*$'] },
      `${process.cwd()}/proj/libs/mylib/src/main.ts`,
      `
      import "../../utils/a";
      `,
      {
        nodes: {
          mylibName: {
            name: 'mylibName',
            type: ProjectType.lib,
            data: {
              root: 'libs/mylib',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`libs/mylib/src/main.ts`)]
            }
          },
          utils: {
            name: 'utils',
            type: ProjectType.lib,
            data: {
              root: 'libs/utils',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`libs/utils/a.ts`)]
            }
          }
        },
        dependencies: {}
      }
    );
    expect(failures.length).toEqual(0);
  });

  it('should error on importing a lazy-loaded library', () => {
    const failures = runRule(
      {},
      `${process.cwd()}/proj/libs/mylib/src/main.ts`,
      'import "@mycompany/other";',
      {
        nodes: {
          mylibName: {
            name: 'mylibName',
            type: ProjectType.lib,
            data: {
              root: 'libs/mylib',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`libs/mylib/src/main.ts`)]
            }
          },
          otherName: {
            name: 'otherName',
            type: ProjectType.lib,
            data: {
              root: 'libs/other',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`libs/other/index.ts`)]
            }
          }
        },
        dependencies: {
          mylibName: [
            {
              source: 'mylibName',
              target: 'otherName',
              type: DependencyType.dynamic
            }
          ]
        }
      }
    );
    expect(failures[0].getFailure()).toEqual(
      'imports of lazy-loaded libraries are forbidden'
    );
  });

  it('should error on importing an app', () => {
    const failures = runRule(
      {},
      `${process.cwd()}/proj/libs/mylib/src/main.ts`,
      'import "@mycompany/myapp"',
      {
        nodes: {
          mylibName: {
            name: 'mylibName',
            type: ProjectType.lib,
            data: {
              root: 'libs/mylib',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`libs/mylib/src/main.ts`)]
            }
          },
          myappName: {
            name: 'myappName',
            type: ProjectType.app,
            data: {
              root: 'apps/myapp',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`apps/myapp/src/index.ts`)]
            }
          }
        },
        dependencies: {}
      }
    );
    expect(failures[0].getFailure()).toEqual('imports of apps are forbidden');
  });

  it('should error when circular dependency detected', () => {
    const failures = runRule(
      {},
      `${process.cwd()}/proj/libs/anotherlib/src/main.ts`,
      'import "@mycompany/mylib"',
      {
        nodes: {
          mylibName: {
            name: 'mylibName',
            type: ProjectType.lib,
            data: {
              root: 'libs/mylib',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`libs/mylib/src/main.ts`)]
            }
          },
          anotherlibName: {
            name: 'anotherlibName',
            type: ProjectType.lib,
            data: {
              root: 'libs/anotherlib',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`libs/anotherlib/src/main.ts`)]
            }
          },
          myappName: {
            name: 'myappName',
            type: ProjectType.app,
            data: {
              root: 'apps/myapp',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`apps/myapp/src/index.ts`)]
            }
          }
        },
        dependencies: {
          mylibName: [
            {
              source: 'mylibName',
              target: 'anotherlibName',
              type: DependencyType.static
            }
          ]
        }
      }
    );
    expect(failures[0].getFailure()).toEqual(
      'Circular dependency between "anotherlibName" and "mylibName" detected'
    );
  });

  it('should error when circular dependency detected (indirect)', () => {
    const failures = runRule(
      {},
      `${process.cwd()}/proj/libs/mylib/src/main.ts`,
      'import "@mycompany/badcirclelib"',
      {
        nodes: {
          mylibName: {
            name: 'mylibName',
            type: ProjectType.lib,
            data: {
              root: 'libs/mylib',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`libs/mylib/src/main.ts`)]
            }
          },
          anotherlibName: {
            name: 'anotherlibName',
            type: ProjectType.lib,
            data: {
              root: 'libs/anotherlib',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`libs/anotherlib/src/main.ts`)]
            }
          },
          badcirclelibName: {
            name: 'badcirclelibName',
            type: ProjectType.lib,
            data: {
              root: 'libs/badcirclelib',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`libs/badcirclelib/src/main.ts`)]
            }
          },
          myappName: {
            name: 'myappName',
            type: ProjectType.app,
            data: {
              root: 'apps/myapp',
              tags: [],
              implicitDependencies: [],
              architect: {},
              files: [createFile(`apps/myapp/index.ts`)]
            }
          }
        },
        dependencies: {
          mylibName: [
            {
              source: 'mylibName',
              target: 'badcirclelibName',
              type: DependencyType.static
            }
          ],
          badcirclelibName: [
            {
              source: 'badcirclelibName',
              target: 'anotherlibName',
              type: DependencyType.static
            }
          ],
          anotherlibName: [
            {
              source: 'anotherlibName',
              target: 'mylibName',
              type: DependencyType.static
            }
          ]
        }
      }
    );
    expect(failures[0].getFailure()).toEqual(
      'Circular dependency between "mylibName" and "badcirclelibName" detected'
    );
  });

  describe('buildable library imports', () => {
    it('should ignore the buildable library verification if the enforceBuildableLibDependency is set to false', () => {
      const failures = runRule(
        {
          enforceBuildableLibDependency: false
        },
        `${process.cwd()}/proj/libs/buildableLib/src/main.ts`,
        'import "@mycompany/nonBuildableLib"',
        {
          nodes: {
            buildableLib: {
              name: 'buildableLib',
              type: ProjectType.lib,
              data: {
                root: 'libs/buildableLib',
                tags: [],
                implicitDependencies: [],
                architect: {
                  build: {
                    // defines a buildable lib
                    builder: '@angular-devkit/build-ng-packagr:build'
                  }
                },
                files: [createFile(`libs/buildableLib/src/main.ts`)]
              }
            },
            nonBuildableLib: {
              name: 'nonBuildableLib',
              type: ProjectType.lib,
              data: {
                root: 'libs/nonBuildableLib',
                tags: [],
                implicitDependencies: [],
                architect: {},
                files: [createFile(`libs/nonBuildableLib/src/main.ts`)]
              }
            }
          },
          dependencies: {}
        }
      );
      expect(failures.length).toBe(0);
    });

    it('should error when buildable libraries import non-buildable libraries', () => {
      const failures = runRule(
        {
          enforceBuildableLibDependency: true
        },
        `${process.cwd()}/proj/libs/buildableLib/src/main.ts`,
        'import "@mycompany/nonBuildableLib"',
        {
          nodes: {
            buildableLib: {
              name: 'buildableLib',
              type: ProjectType.lib,
              data: {
                root: 'libs/buildableLib',
                tags: [],
                implicitDependencies: [],
                architect: {
                  build: {
                    // defines a buildable lib
                    builder: '@angular-devkit/build-ng-packagr:build'
                  }
                },
                files: [createFile(`libs/buildableLib/src/main.ts`)]
              }
            },
            nonBuildableLib: {
              name: 'nonBuildableLib',
              type: ProjectType.lib,
              data: {
                root: 'libs/nonBuildableLib',
                tags: [],
                implicitDependencies: [],
                architect: {},
                files: [createFile(`libs/nonBuildableLib/src/main.ts`)]
              }
            }
          },
          dependencies: {}
        }
      );
      expect(failures[0].getFailure()).toEqual(
        'buildable libs cannot import non-buildable libs'
      );
    });

    it('should not error when buildable libraries import another buildable libraries', () => {
      const failures = runRule(
        {
          enforceBuildableLibDependency: true
        },
        `${process.cwd()}/proj/libs/buildableLib/src/main.ts`,
        'import "@mycompany/nonBuildableLib"',
        {
          nodes: {
            buildableLib: {
              name: 'buildableLib',
              type: ProjectType.lib,
              data: {
                root: 'libs/buildableLib',
                tags: [],
                implicitDependencies: [],
                architect: {
                  build: {
                    // defines a buildable lib
                    builder: '@angular-devkit/build-ng-packagr:build'
                  }
                },
                files: [createFile(`libs/buildableLib/src/main.ts`)]
              }
            },
            anotherBuildableLib: {
              name: 'anotherBuildableLib',
              type: ProjectType.lib,
              data: {
                root: 'libs/anotherBuildableLib',
                tags: [],
                implicitDependencies: [],
                architect: {
                  build: {
                    // defines a buildable lib
                    builder: '@angular-devkit/build-ng-packagr:build'
                  }
                },
                files: [createFile(`libs/anotherBuildableLib/src/main.ts`)]
              }
            }
          },
          dependencies: {}
        }
      );
      expect(failures.length).toBe(0);
    });

    it('should ignore the buildable library verification if no architect is specified', () => {
      const failures = runRule(
        {
          enforceBuildableLibDependency: true
        },
        `${process.cwd()}/proj/libs/buildableLib/src/main.ts`,
        'import "@mycompany/nonBuildableLib"',
        {
          nodes: {
            buildableLib: {
              name: 'buildableLib',
              type: ProjectType.lib,
              data: {
                root: 'libs/buildableLib',
                tags: [],
                implicitDependencies: [],
                files: [createFile(`libs/buildableLib/src/main.ts`)]
              }
            },
            nonBuildableLib: {
              name: 'nonBuildableLib',
              type: ProjectType.lib,
              data: {
                root: 'libs/nonBuildableLib',
                tags: [],
                implicitDependencies: [],
                files: [createFile(`libs/nonBuildableLib/src/main.ts`)]
              }
            }
          },
          dependencies: {}
        }
      );
      expect(failures.length).toBe(0);
    });
  });
});

function createFile(f) {
  return { file: f, ext: extname(f), mtime: 1 };
}

function runRule(
  ruleArguments: any,
  contentPath: string,
  content: string,
  projectGraph: ProjectGraph
): RuleFailure[] {
  const options: any = {
    ruleArguments: [ruleArguments],
    ruleSeverity: 'error',
    ruleName: 'enforceModuleBoundaries'
  };

  const sourceFile = ts.createSourceFile(
    contentPath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const rule = new Rule(
    options,
    `${process.cwd()}/proj`,
    'mycompany',
    projectGraph,
    new TargetProjectLocator(projectGraph.nodes)
  );
  return rule.apply(sourceFile);
}
