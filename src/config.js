import { _, envs, mergeConfig } from 'azk/utils';
var path = require('path');
var os   = require('os');

// Configs paths
var azk_root  = envs('AZK_ROOT_PATH');
var data_path = envs('AZK_DATA_PATH');

// Namespace to support multiple instances of the agent
var namespace = envs('AZK_NAMESPACE');

// Use virtual machine or not?
var default_vm  = os.platform() == "linux" ? false : true;
var requires_vm = envs('AZK_USE_VM', default_vm);

// Data mount folder path
var data_mnt_path = requires_vm ? '/mnt/sda1/azk' : data_path;

// Paths to use in config
var paths = {
  logs: path.join(data_path, 'logs'),
  run : path.join(data_path, 'run'),
  vm  : path.join(data_path, 'vm'),
};

function env() {
  return envs('AZK_ENV', 'production');
}

function set_env(value) {
  process.env.AZK_ENV = value;
  process.env.NODE_ENV = process.env.AZK_ENV;
  return value;
}
set_env(envs('AZK_ENV', envs('NODE_ENV', 'production')));

function vm_memory() {
  var size = Math.floor(os.totalmem() / 1024 / 1024 / 6);
  return Math.max(size, 512);
}

class Dynamic {
  constructor(key) { this.key = key; }
}

// Dir name used by manifest meta
var azk_dir = '.azk';

var options = mergeConfig({
  '*': {
    namespace: namespace,
    manifest : "Azkfile.js",
    locale   : 'en-US',
    azk_dir  : azk_dir,
    flags    : {
      show_deprecate: envs('AZK_HIDE_DEPRECATE', false),
    },
    paths    : {
      azk_root,
      data   : data_path,
      logs   : paths.logs,
      log    : path.join(paths.logs, 'azk.log'),
      shared : path.join(azk_root, "shared"),
      locales: path.join(azk_root, "shared", "locales"),

      azk_meta          : path.join(data_path, azk_dir, "shared", "Azkfile.js"),
      pems              : path.join(paths.vm , '.docker'),
      agent_pid         : path.join(paths.run, 'agent.pid'),
      agent_socket      : path.join(paths.run, 'agent.socket'),
      agent_ping        : envs("AZK_AGENT_PING_FILE"),
      agent_config      : envs("AZK_AGENT_CONF_FILE"),
      memcached_pid     : path.join(paths.run, 'memcachedjs.pid'),
      hipache_pid       : path.join(paths.run, 'hipache.pid'),
      balancer_file     : path.join(paths.run, 'hipache.json'),
      memcached_socket  : path.join(paths.run, 'memcachedjs.socket'),
      api_socket        : path.join(paths.run, 'api.socket'),
      data_mnt_path     : data_mnt_path,
      persistent_folders: path.join(data_mnt_path, 'persistent_folders'),
      sync_folders      : path.join(data_mnt_path, 'sync_folders'),
      analytics         : path.join(data_path, azk_dir, "analytics"),
    },
    logs_level: {
      console: (envs('AZK_DEBUG') ? 'debug' : envs('AZK_OUTPUT_LOG_LEVEL', 'error')),
      file: envs('AZK_LOG_LEVEL', 'warn'),
    },
    docker: {
      socket          : envs('AZK_DOCKER_SOCKER', "/var/run/docker.sock"),
      host            : new Dynamic("docker:host"),
      namespace       : envs('AZK_NAMESPACE'),
      monitor         : envs('AZK_DOCKER_MONITOR', os.platform() === 'linux'),
      version         : envs('AZK_DOCKER_VERSION'),
      min_version     : envs('AZK_DOCKER_MIN_VERSION'),
      api_version     : envs('AZK_DOCKER_API_VERSION'),
      repository      : 'azk',
      default_domain  : 'azk',
      build_name      : 'azkbuild',
      image_default   : 'azukiapp/azktcl:0.0.2',
      remove_container: envs('AZK_REMOVE_CONTAINER', true),
      run: {
        timeout: 10000
      }
    },
    // jscs:disable maximumLineLength
    tracker: {
      permission_key: 'tracker_permission',
      disable       : envs('AZK_DISABLE_TRACKER', false),
      projectId     : envs('AZK_KEEN_PROJECT_ID', '552818c790e4bd7f7bd8baba'),
      writeKey      : envs('AZK_KEEN_WRITE_KEY', 'e2c70b3dd3ed3003a09a1bc7d8622ad9220fe33069d81164f0fafa13baf11458e48736f6cbcc995a8346183b290597504feb4bef06f71350f4859df5eb271a1d845f7cff5c9dfddf2f03de1e39760c6e51a06fb9e347c2e1fb98d3c6d370e6916e5db8810ddd9c0d5d83540386ccfe2e'),
    },
    // jscs:enable maximumLineLength
    report: {
      // TODO: Adding support to filters
      // filters: envs('AZK_REPORT_FITLERS', "*"),
      disable: envs('AZK_REPORT_DISABLE', false),
      url    : envs('AZK_REPORT_URL', "http://api.azk.io/report/A2ObXDzlG6fOJC803qBzDjde2YxygZY4"),
    },
    agent: {
      requires_vm     : requires_vm,
      portrange_start : 11000,
      check_interval  : envs('AZK_AGENT_CHECK_INTERVAL', 10000),
      wait_max_timeout: envs('AZK_AGENT_WAIT_MAX_TIMEOUT', 30000),
      balancer: {
        ip  : new Dynamic("agent:balancer:ip"),
        host: envs('AZK_BALANCER_HOST'),
        port: envs('AZK_BALANCER_PORT', 80),
        file_dns: "/etc/resolver/" + envs('AZK_BALANCER_HOST'),
      },
      dns: {
        ip  : new Dynamic("agent:dns:ip"),
        port: envs('AZK_DNS_PORT', '53'),
        global: [],
        nameservers  : [],
        defaultserver: ['8.8.8.8', '8.8.4.4'],
      },
      vm: {
        wait_ready    : envs('AZK_VM_WAIT_READY', 180000),
        ip            : new Dynamic("agent:vm:ip"),
        name          : envs('AZK_AGENT_VM_NAME', "azk-vm-" + namespace),
        user          : "docker",
        password      : "live",
        cpus          : envs('AZK_VM_CPUS', os.cpus().length),
        memory        : envs('AZK_VM_MEMORY', vm_memory()),
        ssh_key       : envs('AZK_AGENT_VM_KEY', path.join(paths.vm, "azkvm_rsa")),
        screen_path   : path.join(paths.vm, "screens"),
        data_disk     : path.join(paths.vm, "azk-agent.vmdk"),
        boot_disk     : path.join(envs('AZK_LIB_PATH'), "vm", envs('AZK_ISO_VERSION'), "azk.iso"),
        blank_disk    : path.join(envs('AZK_LIB_PATH'), "vm", envs('AZK_ISO_VERSION'), "azk-agent.vmdk.gz"),
        mount_point   : '/media/sf_Root',
        authorized_key: '/home/docker/.ssh/authorized_keys',
      },

      // Used to carry global configuration switches the agent
      config_keys: [],

      // Azk develop helpers
      dev: {
        force_disable_vm: envs('AZK_AGENT_FORCE_VM_DISABLE', false),
        hotswap_code    : envs('AZK_AGENT_HOTSWAP', false),
      }
    },
    urls: {
      github: {
        api:{
          url: "https://api.github.com/repos/azukiapp/azk",
          tags_url: "https://api.github.com/repos/azukiapp/azk/tags",
        },
        content: {
          package_json: "https://raw.githubusercontent.com/azukiapp/azk/stable/package.json",
        }
      },
      force: {
        endpoints: {
          start: 'http://api.azk.io/systems/start',
        }
      }
    },
  },
  development: {
    logs_level: {
      console: (envs('AZK_DEBUG') ? 'debug' : envs('AZK_OUTPUT_LOG_LEVEL', 'warn')),
      file: envs('AZK_LOG_LEVEL', 'debug'),
    },
    tracker: {
      // jscs:disable maximumLineLength
      permission_key: 'tracker_permission',
      disable       : envs('AZK_DISABLE_TRACKER', true),
      projectId     : envs('AZK_KEEN_PROJECT_ID', '5526968d672e6c5a0d0ebec6'),
      writeKey      : envs('AZK_KEEN_WRITE_KEY', '5dbce13e376070e36eec0c7dd1e7f42e49f39b4db041f208054617863832309c14a797409e12d976630c3a4b479004f26b362506e82a46dd54df0c977a7378da280c05ae733c97abb445f58abb56ae15f561ac9ad774cea12c3ad8628d896c39f6e702f6b035541fc1a562997cb05768'),
      // jscs:enable maximumLineLength
    },
    report: {
      url: envs('AZK_REPORT_URL', "http://force-stage.azk.io/report/A2ObXDzlG6fOJC803qBzDjde2YxygZY4"),
    },
    urls: {
      github: {
        content: {
          package_json: "https://raw.githubusercontent.com/azukiapp/azk/master/package.json",
        }
      },
      force: {
        endpoints: {
          start: 'http://force-stage.azk.io/systems/start',
        }
      }
    },
  },
  test: {
    paths: {
      log     : path.join(paths.logs, 'azk_test.log'),
      azk_meta: path.join(data_path, azk_dir, "shared", "test-Azkfile.js"),
    },
    docker: {
      namespace   : 'azk.test',
      repository  : 'azk_test',
      build_name  : 'azkbuildtest',
      image_empty : 'cevich/empty_base_image:latest',
    },
    tracker: {
      disable: true,
      // jscs:disable maximumLineLength
      permission_key: 'tracker_permission_test',
      projectId : envs('AZK_KEEN_PROJECT_ID', '5526968d672e6c5a0d0ebec6'),
      writeKey  : envs('AZK_KEEN_WRITE_KEY', '5dbce13e376070e36eec0c7dd1e7f42e49f39b4db041f208054617863832309c14a797409e12d976630c3a4b479004f26b362506e82a46dd54df0c977a7378da280c05ae733c97abb445f58abb56ae15f561ac9ad774cea12c3ad8628d896c39f6e702f6b035541fc1a562997cb05768'),
      // jscs:enabled maximumLineLength
    },
    report: {
      disable: envs('AZK_REPORT_DISABLE', true),
    },
    logs_level: {
      console: (envs('AZK_DEBUG') ? 'debug' : 'warn'),
      file: envs('AZK_LOG_LEVEL', 'debug'),
    },
    agent: {
      portrange_start: 12000,
      vm: {
        data_disk : path.join(paths.vm, "azk-agent-spec.vmdk"),
      }
    }
  },
});

export function get(key) {
  if (key == "env") {
    return env();
  }

  var keys   = key.split(':');
  var buffer = options[env()] || options['*'];

  for (var i = 0; i < keys.length; i++) {
    buffer = buffer[keys[i]];
    if (!buffer) {
      break;
    }
  }

  if (buffer instanceof Dynamic) {
    throw new Error(`Config ${buffer.key} to be set by configure`);
  }

  return _.clone(buffer);
}

export function set(key, value) {
  if (key == "env") {
    set_env(value);
  } else {
    var keys   = [env(), ...key.split(':')];
    var buffer = {};
    buffer[keys.pop()] = value;

    while ((key = keys.pop())) {
      var inner_buffer  = {};
      inner_buffer[key] = buffer;
      buffer = inner_buffer;
    }

    // Check env exist
    if (!options[env()]) {
      options[env()] = _.cloneDeep(options['*']);
    }

    _.merge(options, buffer);
  }
  return value;
}
